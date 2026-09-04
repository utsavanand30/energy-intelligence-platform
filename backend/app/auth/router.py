import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.email_service import (
    account_lockout_html,
    email_verification_html,
    password_reset_html,
    send_email,
)
from app.auth.jwt_handler import (
    clear_auth_cookie,
    create_access_token,
    set_auth_cookie,
)
from app.auth.oauth_client import (
    exchange_google_code,
    exchange_microsoft_code,
    generate_sso_username,
    get_google_auth_url,
    get_google_user_info,
    get_microsoft_auth_url,
    get_microsoft_user_info,
)
from app.auth.password import (
    generate_temp_password,
    hash_password,
    validate_complexity,
    verify_password,
)
from app.models.auth_audit_log import AuthAuditLog, AuthEventType
from app.models.email_verification import EmailVerification
from app.models.password_reset_token import PasswordResetToken
from app.models.session import Session
from app.models.user import User, UserRole
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    PasswordResetConfirmSchema,
    PasswordResetRequestSchema,
    RegisterRequest,
    UserResponse,
    VerifyEmailRequest,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log_event(
    db: DBSession,
    event_type: AuthEventType,
    request: Request,
    user_id: Optional[int] = None,
    details: Optional[dict] = None,
) -> None:
    log = AuthAuditLog(
        user_id=user_id,
        event_type=event_type.value,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
        details=details,
    )
    db.add(log)
    db.commit()


def _mask_email(email: str) -> str:
    """Mask email for logging: user@domain.com → u***@domain.com"""
    if "@" not in email:
        return email[:2] + "***"
    local, domain = email.split("@", 1)
    return local[0] + "***@" + domain


def _revoke_all_sessions(db: DBSession, user_id: int, except_jti: Optional[str] = None) -> None:
    now = datetime.now(timezone.utc)
    q = db.query(Session).filter(
        Session.user_id == user_id,
        Session.revoked_at.is_(None),
    )
    if except_jti:
        q = q.filter(Session.token_jti != except_jti)
    for s in q.all():
        s.revoked_at = now
    db.commit()


def _get_redirect_uri(request: Request, provider: str) -> str:
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/api/auth/sso/{provider}/callback"


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
def auth_health():
    return {"status": "ok", "service": "auth"}


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    # Look up by username OR email (case-insensitive email)
    user = db.query(User).filter(
        (User.username == body.identifier) |
        (func.lower(User.email) == body.identifier.lower())
    ).first()

    if not user or not user.active:
        _log_event(db, AuthEventType.LOGIN_FAILED, request,
                   details={"identifier": body.identifier[:50], "reason": "not_found_or_inactive"})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail={"error": "INVALID_CREDENTIALS",
                                    "message": "Invalid username or password"})

    # Lockout check
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        unlock_str = user.locked_until.strftime("%H:%M UTC")
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            detail={"error": "ACCOUNT_LOCKED",
                                    "message": f"Account locked. Try again after {unlock_str}"})

    # Password check
    if not verify_password(body.password, user.hashed_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= 5:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            db.commit()
            _log_event(db, AuthEventType.ACCOUNT_LOCKED, request, user.id,
                       {"reason": "too_many_failures"})
            # Send lockout email async (fire and forget)
            import asyncio
            if user.email:
                asyncio.create_task(send_email(
                    user.email,
                    "EnergyIQ Account Locked",
                    account_lockout_html(user.username, user.locked_until.strftime("%H:%M UTC")),
                ))
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                                detail={"error": "ACCOUNT_LOCKED",
                                        "message": "Too many failed attempts. Account locked for 15 minutes."})
        db.commit()
        _log_event(db, AuthEventType.LOGIN_FAILED, request, user.id,
                   {"reason": "wrong_password", "attempts": user.failed_login_attempts})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail={"error": "INVALID_CREDENTIALS",
                                    "message": "Invalid username or password"})

    # Email verification check
    if not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            detail={"error": "EMAIL_NOT_VERIFIED",
                                    "message": "Please verify your email before logging in"})

    # Success — reset attempts, issue token
    user.failed_login_attempts = 0
    user.last_login = datetime.now(timezone.utc)
    token, jti, expires_at = create_access_token(
        user.id, user.email or user.username, user.role.value, body.remember_me
    )
    db_session = Session(user_id=user.id, token_jti=jti, expires_at=expires_at)
    db.add(db_session)
    db.commit()

    _log_event(db, AuthEventType.LOGIN_SUCCESS, request, user.id, {"method": "password"})
    set_auth_cookie(response, token, body.remember_me)
    return LoginResponse(user=UserResponse.model_validate(user), expires_at=expires_at)


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=MessageResponse)
async def register(
    body: RegisterRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    errors = validate_complexity(body.password)
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail={"error": "PASSWORD_COMPLEXITY_FAILED",
                                    "message": "Password does not meet requirements",
                                    "details": errors})

    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail={"error": "USERNAME_ALREADY_EXISTS",
                                    "message": "That username is already taken"})

    if db.query(User).filter(func.lower(User.email) == body.email.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail={"error": "EMAIL_ALREADY_EXISTS",
                                    "message": "An account with that email already exists"})

    user = User(
        username=body.username,
        email=body.email.lower(),
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=UserRole.VIEWER,
        email_verified=False,
        must_reset_password=False,
        active=True,
    )
    db.add(user)
    db.flush()  # get user.id

    token = secrets.token_urlsafe(32)
    verification = EmailVerification(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(verification)
    db.commit()

    verify_link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    import asyncio
    asyncio.create_task(send_email(
        user.email,
        "Verify your EnergyIQ account",
        email_verification_html(user.full_name or user.username, verify_link),
    ))

    _log_event(db, AuthEventType.REGISTER, request, user.id)
    return MessageResponse(message="Account created. Check your email to verify your account.")


# ── Verify email ──────────────────────────────────────────────────────────────

@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(
    body: VerifyEmailRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    v = db.query(EmailVerification).filter(EmailVerification.token == body.token).first()
    if not v or v.verified_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail={"error": "INVALID_VERIFICATION_TOKEN",
                                    "message": "Invalid or already used verification token"})
    if v.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail={"error": "VERIFICATION_TOKEN_EXPIRED",
                                    "message": "Verification link has expired. Please request a new one."})

    v.verified_at = datetime.now(timezone.utc)
    v.user.email_verified = True
    db.commit()
    _log_event(db, AuthEventType.EMAIL_VERIFIED, request, v.user_id)
    return MessageResponse(message="Email verified successfully. You can now log in.")


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.auth.jwt_handler import decode_access_token, get_token_from_request
    token = get_token_from_request(request)
    if token:
        try:
            payload = decode_access_token(token)
            jti = payload.get("jti")
            if jti:
                s = db.query(Session).filter(Session.token_jti == jti).first()
                if s:
                    s.revoked_at = datetime.now(timezone.utc)
                    db.commit()
        except Exception:
            pass

    clear_auth_cookie(response)
    _log_event(db, AuthEventType.LOGOUT, request, current_user.id)
    return MessageResponse(message="You have been logged out")


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


# ── Refresh ───────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=MessageResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.auth.jwt_handler import decode_access_token, get_token_from_request
    token = get_token_from_request(request)
    payload = decode_access_token(token)
    jti = payload.get("jti")

    old_session = db.query(Session).filter(Session.token_jti == jti).first()
    remember_me = False
    if old_session:
        delta = old_session.expires_at - old_session.created_at
        remember_me = delta.days >= 7
        old_session.revoked_at = datetime.now(timezone.utc)

    new_token, new_jti, expires_at = create_access_token(
        current_user.id,
        current_user.email or current_user.username,
        current_user.role.value,
        remember_me,
    )
    new_session = Session(user_id=current_user.id, token_jti=new_jti, expires_at=expires_at)
    db.add(new_session)
    db.commit()

    set_auth_cookie(response, new_token, remember_me)
    _log_event(db, AuthEventType.TOKEN_REFRESHED, request, current_user.id)
    return MessageResponse(message="Token refreshed")


# ── Password reset request ────────────────────────────────────────────────────

@router.post("/password-reset-request", response_model=MessageResponse)
async def password_reset_request(
    body: PasswordResetRequestSchema,
    request: Request,
    db: DBSession = Depends(get_db),
):
    _log_event(db, AuthEventType.PASSWORD_RESET_REQUEST, request,
               details={"email": _mask_email(body.email)})

    user = db.query(User).filter(func.lower(User.email) == body.email.lower()).first()
    if user:
        # Delete existing unused tokens
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).delete()

        token = secrets.token_urlsafe(32)
        prt = PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(prt)
        db.commit()

        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        import asyncio
        asyncio.create_task(send_email(
            user.email,
            "Reset your EnergyIQ password",
            password_reset_html(reset_link),
        ))

    return MessageResponse(
        message="If an account with that email exists, you'll receive a reset link shortly."
    )


# ── Password reset confirm ────────────────────────────────────────────────────

@router.post("/password-reset-confirm", response_model=MessageResponse)
async def password_reset_confirm(
    body: PasswordResetConfirmSchema,
    request: Request,
    db: DBSession = Depends(get_db),
):
    prt = db.query(PasswordResetToken).filter(PasswordResetToken.token == body.token).first()
    if not prt or prt.used_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail={"error": "INVALID_RESET_TOKEN",
                                    "message": "Invalid or already used reset token"})
    if prt.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail={"error": "RESET_TOKEN_EXPIRED",
                                    "message": "Reset link has expired. Request a new one."})

    errors = validate_complexity(body.new_password)
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail={"error": "PASSWORD_COMPLEXITY_FAILED",
                                    "message": "Password does not meet requirements",
                                    "details": errors})

    user = prt.user
    user.hashed_password = hash_password(body.new_password)
    prt.used_at = datetime.now(timezone.utc)
    _revoke_all_sessions(db, user.id)
    db.commit()

    _log_event(db, AuthEventType.PASSWORD_RESET_COMPLETE, request, user.id)
    return MessageResponse(message="Password changed successfully.")


# ── Change password (authenticated) ──────────────────────────────────────────

@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.auth.jwt_handler import decode_access_token, get_token_from_request
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail={"error": "INVALID_CREDENTIALS",
                                    "message": "Current password is incorrect"})

    if body.new_password == body.current_password:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail={"error": "SAME_PASSWORD",
                                    "message": "New password must differ from current password"})

    errors = validate_complexity(body.new_password)
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail={"error": "PASSWORD_COMPLEXITY_FAILED",
                                    "message": "Password does not meet requirements",
                                    "details": errors})

    token = get_token_from_request(request)
    current_jti = None
    if token:
        try:
            current_jti = decode_access_token(token).get("jti")
        except Exception:
            pass

    current_user.hashed_password = hash_password(body.new_password)
    current_user.must_reset_password = False
    _revoke_all_sessions(db, current_user.id, except_jti=current_jti)
    db.commit()

    _log_event(db, AuthEventType.PASSWORD_CHANGED, request, current_user.id)
    return MessageResponse(message="Password changed successfully.")


# ── SSO: Microsoft ────────────────────────────────────────────────────────────

@router.get("/sso/microsoft")
async def sso_microsoft(response: Response):
    state = secrets.token_urlsafe(32)
    redirect_uri = f"{settings.FRONTEND_URL.rstrip('/')}/api/auth/sso/microsoft/callback"
    auth_url = get_microsoft_auth_url(state, redirect_uri)
    resp = RedirectResponse(url=auth_url, status_code=302)
    resp.set_cookie("oauth_state", state, httponly=True, samesite="lax", max_age=600, path="/api/auth/sso")
    return resp


@router.get("/sso/microsoft/callback")
async def sso_microsoft_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: DBSession = Depends(get_db),
):
    frontend = settings.FRONTEND_URL.rstrip("/")

    if error or not code:
        return RedirectResponse(url=f"{frontend}/login?error=sso_cancelled", status_code=302)

    cookie_state = request.cookies.get("oauth_state")
    if not cookie_state or cookie_state != state:
        return RedirectResponse(url=f"{frontend}/login?error=sso_state_mismatch", status_code=302)

    redirect_uri = f"{frontend}/api/auth/sso/microsoft/callback"
    try:
        tokens = await exchange_microsoft_code(code, redirect_uri)
        user_info = await get_microsoft_user_info(tokens["access_token"])
    except Exception:
        return RedirectResponse(url=f"{frontend}/login?error=sso_failed", status_code=302)

    email = user_info.get("mail") or user_info.get("userPrincipalName", "")
    name = user_info.get("displayName", "")

    if not email:
        return RedirectResponse(url=f"{frontend}/login?error=sso_no_email", status_code=302)

    user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
    if not user:
        existing_usernames = {u.username for u in db.query(User.username).all()}
        user = User(
            email=email.lower(),
            username=generate_sso_username(email, existing_usernames),
            full_name=name,
            hashed_password="!",
            role=UserRole.VIEWER,
            email_verified=True,
            sso_provider="microsoft",
            active=True,
        )
        db.add(user)
        db.flush()

    user.last_login = datetime.now(timezone.utc)
    token, jti, expires_at = create_access_token(user.id, user.email, user.role.value)
    db_session = Session(user_id=user.id, token_jti=jti, expires_at=expires_at)
    db.add(db_session)
    db.commit()

    _log_event(db, AuthEventType.SSO_LOGIN, request, user.id, {"provider": "microsoft"})

    redirect_to = f"{frontend}/change-password" if user.must_reset_password else frontend
    resp = RedirectResponse(url=redirect_to, status_code=302)
    resp.delete_cookie("oauth_state", path="/api/auth/sso")
    set_auth_cookie(resp, token)
    return resp


# ── SSO: Google ───────────────────────────────────────────────────────────────

@router.get("/sso/google")
async def sso_google():
    state = secrets.token_urlsafe(32)
    redirect_uri = f"{settings.FRONTEND_URL.rstrip('/')}/api/auth/sso/google/callback"
    auth_url = get_google_auth_url(state, redirect_uri)
    resp = RedirectResponse(url=auth_url, status_code=302)
    resp.set_cookie("oauth_state", state, httponly=True, samesite="lax", max_age=600, path="/api/auth/sso")
    return resp


@router.get("/sso/google/callback")
async def sso_google_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: DBSession = Depends(get_db),
):
    frontend = settings.FRONTEND_URL.rstrip("/")

    if error or not code:
        return RedirectResponse(url=f"{frontend}/login?error=sso_cancelled", status_code=302)

    cookie_state = request.cookies.get("oauth_state")
    if not cookie_state or cookie_state != state:
        return RedirectResponse(url=f"{frontend}/login?error=sso_state_mismatch", status_code=302)

    redirect_uri = f"{frontend}/api/auth/sso/google/callback"
    try:
        tokens = await exchange_google_code(code, redirect_uri)
        user_info = await get_google_user_info(tokens["access_token"])
    except Exception:
        return RedirectResponse(url=f"{frontend}/login?error=sso_failed", status_code=302)

    email = user_info.get("email", "")
    name = user_info.get("name", "")
    picture = user_info.get("picture")

    if not email:
        return RedirectResponse(url=f"{frontend}/login?error=sso_no_email", status_code=302)

    user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
    if not user:
        existing_usernames = {u.username for u in db.query(User.username).all()}
        user = User(
            email=email.lower(),
            username=generate_sso_username(email, existing_usernames),
            full_name=name,
            hashed_password="!",
            role=UserRole.VIEWER,
            email_verified=True,
            sso_provider="google",
            profile_picture_url=picture,
            active=True,
        )
        db.add(user)
        db.flush()
    else:
        if picture:
            user.profile_picture_url = picture

    user.last_login = datetime.now(timezone.utc)
    token, jti, expires_at = create_access_token(user.id, user.email, user.role.value)
    db_session = Session(user_id=user.id, token_jti=jti, expires_at=expires_at)
    db.add(db_session)
    db.commit()

    _log_event(db, AuthEventType.SSO_LOGIN, request, user.id, {"provider": "google"})

    redirect_to = f"{frontend}/change-password" if user.must_reset_password else frontend
    resp = RedirectResponse(url=redirect_to, status_code=302)
    resp.delete_cookie("oauth_state", path="/api/auth/sso")
    set_auth_cookie(resp, token)
    return resp
