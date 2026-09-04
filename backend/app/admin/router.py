from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session as DBSession

from app.auth.dependencies import get_current_user, require_admin
from app.auth.email_service import send_email, welcome_admin_created_html
from app.auth.password import generate_temp_password, hash_password, validate_complexity
from app.core.config import settings
from app.core.database import get_db
from app.models.auth_audit_log import AuthAuditLog, AuthEventType
from app.models.session import Session
from app.models.user import User, UserRole
from app.schemas.auth import (
    AuditLogResponse,
    CreateUserRequest,
    MessageResponse,
    UpdateUserRequest,
    UserResponse,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


def _log_event(db, event_type, request, user_id=None, details=None):
    log = AuthAuditLog(
        user_id=user_id,
        event_type=event_type.value,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
        details=details,
    )
    db.add(log)
    db.commit()


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    role: Optional[UserRole] = None,
    active: Optional[bool] = None,
    search: Optional[str] = None,
    db: DBSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(User)
    if role is not None:
        q = q.filter(User.role == role)
    if active is not None:
        q = q.filter(User.active == active)
    if search:
        pattern = f"%{search}%"
        q = q.filter(or_(
            User.username.ilike(pattern),
            User.email.ilike(pattern),
            User.full_name.ilike(pattern),
        ))
    return [UserResponse.model_validate(u) for u in q.order_by(User.created_at.desc()).all()]


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail={"error": "USERNAME_ALREADY_EXISTS",
                                    "message": "Username already taken"})
    if body.email and db.query(User).filter(
        func.lower(User.email) == body.email.lower()
    ).first():
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail={"error": "EMAIL_ALREADY_EXISTS",
                                    "message": "Email already registered"})

    plain_password = body.password or generate_temp_password()
    if body.password:
        errors = validate_complexity(body.password)
        if errors:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail={"error": "PASSWORD_COMPLEXITY_FAILED",
                                        "message": "Password does not meet requirements",
                                        "details": errors})

    user = User(
        username=body.username,
        email=body.email.lower() if body.email else None,
        full_name=body.full_name,
        hashed_password=hash_password(plain_password),
        role=body.role,
        email_verified=True,  # admin-created users bypass email verification
        must_reset_password=True,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if user.email:
        import asyncio
        asyncio.create_task(send_email(
            user.email,
            "Welcome to EnergyIQ",
            welcome_admin_created_html(user.username, plain_password, settings.FRONTEND_URL),
        ))

    _log_event(db, AuthEventType.REGISTER, request, user.id,
               {"created_by_admin": admin.id})
    return UserResponse.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: UpdateUserRequest,
    request: Request,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail={"error": "NOT_FOUND", "message": "User not found"})

    if body.role is not None and body.role != user.role:
        old_role = user.role.value
        user.role = body.role
        _log_event(db, AuthEventType.ROLE_CHANGED, request, user.id,
                   {"admin_id": admin.id, "old_role": old_role, "new_role": body.role.value})

    if body.active is not None:
        user.active = body.active
    if body.full_name is not None:
        user.full_name = body.full_name

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/users/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: int,
    request: Request,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail={"error": "CANNOT_DELETE_SELF",
                                    "message": "You cannot delete your own account"})
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND,
                            detail={"error": "NOT_FOUND", "message": "User not found"})
    user.active = False
    db.commit()
    return MessageResponse(message=f"User {user.username} has been deactivated")


@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    event_type: Optional[str] = None,
    user_id: Optional[int] = None,
    db: DBSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(AuthAuditLog)
    if event_type:
        q = q.filter(AuthAuditLog.event_type == event_type)
    if user_id:
        q = q.filter(AuthAuditLog.user_id == user_id)
    total = q.count()
    logs = q.order_by(AuthAuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return [AuditLogResponse.model_validate(log) for log in logs]
