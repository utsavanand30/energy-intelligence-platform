# Implementation Plan: Authentication & Landing Page

## Authentication & Landing Page
**Feature ID:** `authentication-landing-page`  
**Design Reference:** `design.md`  
**Requirements Reference:** `requirements.md`

---

## Overview

This document lists the implementation tasks for the Authentication & Landing Page feature, derived from `design.md` and `requirements.md`. Tasks are ordered by dependency — backend first, then frontend. Each task references the relevant design section and lists specific files to create or modify.

**Total tasks:** 42 across 12 groups  
**Estimated groups:** Backend (Groups 1–6) → Frontend (Groups 7–10) → Tests (Group 11) → Verification (Group 12)

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "1.2", "1.3"],
      "description": "Backend foundation — deps, config, env vars"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"],
      "description": "Database models and Alembic migration"
    },
    {
      "wave": 3,
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7"],
      "description": "Auth service modules — password, JWT, email, OAuth, dependencies, schemas"
    },
    {
      "wave": 4,
      "tasks": ["4.1", "4.2", "5.1", "5.2"],
      "description": "Auth and admin routes — parallel"
    },
    {
      "wave": 5,
      "tasks": ["6.1", "6.2", "6.3"],
      "description": "Protect existing routes, wire up main.py"
    },
    {
      "wave": 6,
      "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8"],
      "description": "Frontend auth infrastructure — context, guards, router"
    },
    {
      "wave": 7,
      "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10"],
      "description": "Auth pages and components"
    },
    {
      "wave": 8,
      "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "10.1", "10.2", "10.3"],
      "description": "Session management and admin UI — parallel"
    },
    {
      "wave": 9,
      "tasks": ["11.1", "11.2", "11.3", "11.4"],
      "description": "Testing — unit and integration"
    },
    {
      "wave": 10,
      "tasks": ["12.1"],
      "description": "Final integration verification"
    }
  ]
}
```

Groups 4 and 5 can be worked in parallel once Group 3 is complete.  
Groups 8, 9, and 10 can be worked in parallel once Group 7 is complete.  
Group 11 tests can be written alongside their respective implementation groups.

## Tasks


## Group 1: Backend Foundation

- [x] 1.1 Install new Python backend dependencies
  - Add to `backend/requirements.txt`:
    - `python-jose[cryptography]==3.3.0`
    - `passlib[bcrypt]==1.7.4`
    - `aiosmtplib==3.0.1`
    - `authlib==1.3.1`
    - `httpx==0.27.0`
    - `slowapi==0.1.9`
    - `pydantic[email]==2.7.1`
  - Run `pip install -r requirements.txt` to verify no conflicts
  - _Design ref: Appendix A — Backend Dependencies_
  - _Requirements: FR-1, FR-2, FR-4, FR-5_

- [x] 1.2 Extend `backend/app/core/config.py` with auth environment variables
  - Add to the `Settings` class:
    ```python
    JWT_SECRET_KEY: str = "dev-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "EnergyIQ Platform"
    AZURE_CLIENT_ID: str = ""
    AZURE_CLIENT_SECRET: str = ""
    AZURE_TENANT_ID: str = ""
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_WORKSPACE_DOMAIN: str = ""
    FRONTEND_URL: str = "http://localhost:5173"
    ```
  - Keep all existing fields untouched
  - _Design ref: §2.11 — Environment Variables_
  - _Requirements: FR-1, FR-4, FR-5_

- [x] 1.3 Update `backend/.env.example` with all new auth env vars
  - Add all variables from §2.11 with placeholder values and comments
  - Include generation hint: `JWT_SECRET_KEY=<run: python -c "import secrets; print(secrets.token_hex(32))">`
  - Mark SSO vars as optional with note about which flows they enable
  - Mark SMTP vars as optional (features degrade gracefully when empty)
  - _Design ref: §2.11 — Environment Variables_

---

## Group 2: Database Models & Migration

- [x] 2.1 Extend `backend/app/models/user.py` with new auth columns
  - Add the following columns to the existing `User` model (keep all existing columns):
    ```python
    must_reset_password = Column(Boolean, default=False, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    sso_provider = Column(String(50), nullable=True)
    profile_picture_url = Column(String(500), nullable=True)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    ```
  - Add `sessions` relationship after the Session model exists:
    ```python
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    ```
  - Do NOT remove the existing `__repr__` or any existing columns
  - _Design ref: §2.2 — Database Models, `app/models/user.py` Extended_
  - _Requirements: US-5, US-8, FR-3, FR-7_

- [x] 2.2 Create `backend/app/models/session.py`
  - New SQLAlchemy model with table name `sessions`
  - Columns: `id`, `user_id` (FK→users, CASCADE DELETE), `token_jti` (unique, indexed), `created_at`, `expires_at` (indexed), `last_activity`, `revoked_at` (nullable)
  - Add `is_active` property: returns `True` when `revoked_at is None` and `expires_at > datetime.now(utc)`
  - Add `user` relationship back-referencing `User`
  - _Design ref: §2.2 — `app/models/session.py`_
  - _Requirements: FR-7, US-9_

- [x] 2.3 Create `backend/app/models/password_reset_token.py`
  - New SQLAlchemy model with table name `password_reset_tokens`
  - Columns: `id`, `user_id` (FK→users, CASCADE DELETE), `token` (unique, indexed), `expires_at`, `used_at` (nullable), `created_at`
  - Add `user` relationship
  - _Design ref: §2.2 — `app/models/password_reset_token.py`_
  - _Requirements: FR-2, US-6, US-7_

- [x] 2.4 Create `backend/app/models/email_verification.py`
  - New SQLAlchemy model with table name `email_verifications`
  - Columns: `id`, `user_id` (FK→users, CASCADE DELETE), `token` (unique, indexed), `expires_at`, `verified_at` (nullable), `created_at`
  - Add `user` relationship
  - _Design ref: §2.2 — `app/models/email_verification.py`_
  - _Requirements: FR-6, US-4_

- [x] 2.5 Create `backend/app/models/auth_audit_log.py`
  - New SQLAlchemy model with table name `auth_audit_logs`
  - Define `AuthEventType` string enum with all 12 event values: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `REGISTER`, `EMAIL_VERIFIED`, `PASSWORD_RESET_REQUEST`, `PASSWORD_RESET_COMPLETE`, `PASSWORD_CHANGED`, `ROLE_CHANGED`, `ACCOUNT_LOCKED`, `SSO_LOGIN`, `TOKEN_REFRESHED`
  - Columns: `id`, `user_id` (FK→users, SET NULL, nullable, indexed), `event_type` (String 50, indexed), `ip_address` (String 45, nullable), `user_agent` (String 500, nullable), `details` (JSON, nullable), `created_at` (indexed)
  - _Design ref: §2.2 — `app/models/auth_audit_log.py`_
  - _Requirements: FR-9_

- [x] 2.6 Update `backend/app/models/__init__.py` to export new models
  - Add imports and `__all__` entries for: `Session`, `PasswordResetToken`, `EmailVerification`, `AuthAuditLog`, `AuthEventType`
  - Keep all existing exports (`Plant`, `Shed`, `Section`, `Machine`, `EnergyMeter`, `MeterReading`, `Alert`, `AlertRule`, `AuditLog`, `User`)
  - This ensures `Base.metadata` picks up all tables when `import app.models` runs in `main.py`
  - _Design ref: §2.1 — New File Structure_

- [x] 2.7 Create Alembic migration `backend/alembic/versions/<timestamp>_add_auth_tables.py`
  - Migration adds new columns to `users` table: `must_reset_password`, `email_verified`, `sso_provider`, `profile_picture_url`, `failed_login_attempts`, `locked_until`
  - After adding columns, run: `UPDATE users SET email_verified = true, must_reset_password = false` to prevent lockout of existing seed users
  - Creates tables in this order: `sessions`, `password_reset_tokens`, `email_verifications`, `auth_audit_logs`
  - Creates all indexes as specified in design (ix_sessions_user_id, ix_sessions_token_jti, ix_sessions_expires_at, ix_prt_token, ix_ev_token, ix_aal_user_id, ix_aal_event_type, ix_aal_created_at)
  - Implements `downgrade()` that reverses all changes in reverse order
  - Run `alembic upgrade head` in `backend/` to verify migration applies cleanly
  - _Design ref: §2.3 — Alembic Migration_
  - _Requirements: All FR database requirements_

---

## Group 3: Auth Service (Backend)

- [x] 3.1 Create `backend/app/auth/__init__.py`
  - Empty file to make `app/auth` a Python package
  - _Design ref: §2.1 — New File Structure_

- [x] 3.2 Create `backend/app/auth/password.py`
  - Use `passlib.context.CryptContext(schemes=["bcrypt"], bcrypt__rounds=12)`
  - Implement `hash_password(plain: str) -> str`
  - Implement `verify_password(plain: str, hashed: str) -> bool`
  - Implement `validate_complexity(password: str) -> list[str]` — returns list of unmet rules; empty = valid. Rules: ≥8 chars, ≤128 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit, ≥1 special char from `[@$!%*?&]`, not in common passwords list
  - Implement `generate_temp_password(length: int = 16) -> str` — generates a random password from `string.ascii_letters + string.digits + "@$!%*?&"` that passes `validate_complexity`
  - Bundle `backend/app/auth/common_passwords.txt` (top-10k common passwords, one per line) — load at module import time into a `set[str]`, checked case-insensitively
  - _Design ref: §2.12 — Password Security_
  - _Requirements: FR-2, US-4, US-7_

- [x] 3.3 Create `backend/app/auth/jwt_handler.py`
  - Import `jose.jwt`, `jose.JWTError` from `python-jose`; import `settings` from `app.core.config`
  - Implement `create_access_token(user_id, email, role, remember_me) -> tuple[str, str, datetime]` — returns `(encoded_token, jti, expires_at)`. Use `uuid.uuid4()` for jti. Lifetime: 7 days if `remember_me`, else `settings.ACCESS_TOKEN_EXPIRE_HOURS` hours
  - Implement `decode_access_token(token: str) -> dict` — raises `HTTPException(401)` with `{"error": "TOKEN_INVALID", "message": "Invalid or expired token"}` on any `JWTError`
  - Implement `set_auth_cookie(response, token, remember_me)` — sets `access_token` cookie with `httponly=True`, `secure=True`, `samesite="strict"`, `path="/"`, `max_age=28800` (or `604800` if `remember_me`)
  - Implement `clear_auth_cookie(response)` — calls `response.delete_cookie("access_token", path="/", samesite="strict")`
  - Implement `get_token_from_request(request: Request) -> Optional[str]` — returns `request.cookies.get("access_token")`
  - _Design ref: §2.5 — JWT Structure, §2.6 — Cookie Configuration_
  - _Requirements: FR-1, US-9_

- [x] 3.4 Create `backend/app/auth/email_service.py`
  - Implement `async send_email(to, subject, html_body)` using `aiosmtplib`. Returns silently (no exception) when `settings.SMTP_HOST` is empty — safe for local dev
  - Use `email.mime.multipart.MIMEMultipart` + `MIMEText` to build the message. Set `From` header as `"{SMTP_FROM_NAME} <{SMTP_USER}>"`
  - Use `use_tls=True` when port is 465, `start_tls=True` when port is 587
  - Implement HTML template functions (return formatted HTML strings, not file reads):
    - `email_verification_html(full_name, verify_link) -> str`
    - `password_reset_html(verify_link) -> str`
    - `welcome_admin_created_html(username, temp_password, login_url) -> str`
    - `account_lockout_html(username, unlock_time) -> str`
  - _Design ref: §2.10 — SMTP Email Service_
  - _Requirements: FR-6, US-4, US-5, US-6, FR-3_

- [x] 3.5 Create `backend/app/auth/oauth_client.py`
  - Use `authlib.integrations.starlette_client` (or raw `httpx` calls if authlib Starlette client is incompatible) for OAuth 2.0 flows
  - Implement Microsoft OAuth helpers:
    - `get_microsoft_auth_url(state: str) -> str` — builds Azure AD authorization URL with `openid profile email` scopes, `response_mode=query`
    - `async exchange_microsoft_code(code: str, redirect_uri: str) -> dict` — POSTs to token endpoint, returns token response
    - `async get_microsoft_user_info(access_token: str) -> dict` — GETs `https://graph.microsoft.com/v1.0/me`, returns `{mail, userPrincipalName, displayName}`
  - Implement Google OAuth helpers:
    - `get_google_auth_url(state: str) -> str` — builds Google authorization URL with optional `hd` param if `settings.GOOGLE_WORKSPACE_DOMAIN` is set
    - `async exchange_google_code(code: str, redirect_uri: str) -> dict`
    - `async get_google_user_info(access_token: str) -> dict` — GETs `https://www.googleapis.com/oauth2/v3/userinfo`, returns `{email, name, picture}`
  - Implement `generate_sso_username(email: str) -> str` — strips domain part, appends random 4-digit suffix if username already exists
  - _Design ref: §2.7 — OAuth 2.0 Flow_
  - _Requirements: US-2, US-3, FR-4, FR-5, US-13_

- [x] 3.6 Create `backend/app/auth/dependencies.py`
  - Implement `async get_current_user(request, db)` FastAPI dependency:
    1. Call `get_token_from_request(request)` — raise `HTTPException(401, {"error": "UNAUTHORIZED", ...})` if None
    2. Call `decode_access_token(token)` — extracts `jti` and `sub`
    3. Query `Session` by `token_jti` — raise `HTTPException(401, {"error": "TOKEN_REVOKED", ...})` if not found or `not session.is_active`
    4. Update `session.last_activity = datetime.now(utc)` and commit
    5. Query `User` by id — raise `HTTPException(401)` if not found or `not user.active`
    6. Return the `User` object
  - Implement `require_role(*roles: UserRole) -> Callable` — returns a dependency that calls `get_current_user` then checks `current_user.role in roles`, raises `HTTPException(403, {"error": "FORBIDDEN", ...})` if not
  - Define convenience aliases: `require_admin`, `require_maintenance`, `require_energy_eng`, `require_operator_plus`
  - _Design ref: §2.8 — FastAPI Dependencies_
  - _Requirements: US-14, FR-8_

- [x] 3.7 Create `backend/app/schemas/auth.py`
  - Define all Pydantic v2 request schemas:
    - `LoginRequest(identifier, password, remember_me=False)`
    - `RegisterRequest(full_name, email, username, password, confirm_password)` with `@model_validator` ensuring passwords match
    - `PasswordResetRequestSchema(email: EmailStr)`
    - `PasswordResetConfirmSchema(token, new_password, confirm_password)` with `@model_validator`
    - `ChangePasswordRequest(current_password, new_password, confirm_password)` with `@model_validator`
    - `VerifyEmailRequest(token)`
    - `CreateUserRequest(username, email, full_name, role=VIEWER, password=None)`
    - `UpdateUserRequest(role, active, full_name)` — all optional
  - Define all Pydantic v2 response schemas:
    - `UserResponse` — all user fields, `from_attributes = True`
    - `LoginResponse(user: UserResponse, message="Login successful")`
    - `MessageResponse(message)`
    - `ErrorResponse(error, message, details=None)`
    - `AuditLogResponse(id, user_id, event_type, ip_address, details, created_at)` — `from_attributes = True`
  - Import `UserRole` from `app.models.user`
  - _Design ref: §2.4 — Pydantic Schemas_

---

## Group 4: Auth Routes (Backend)

- [x] 4.1 Create `backend/app/auth/router.py` — auth endpoints
  - Create `APIRouter(prefix="/auth", tags=["Auth"])`
  - Set up `slowapi` limiter instance (`key_func=get_remote_address`)
  - Add `log_auth_event` helper function:
    ```python
    async def log_auth_event(db, event_type, request, user_id=None, details=None)
    ```
    Creates and commits an `AuthAuditLog` row. Masks email in details as `u***@domain.com`.

  - **POST `/login`** — rate limit 10/minute
    1. Look up user by `identifier` matching `username` OR `func.lower(email) == identifier.lower()`
    2. Check `user.active` → 403 `ACCOUNT_INACTIVE`
    3. Check `user.locked_until > now` → 429 `ACCOUNT_LOCKED` (include unlock time in message)
    4. `verify_password(request.password, user.hashed_password)` — on failure: increment `failed_login_attempts`; if `>= 5` set `locked_until = now + 15min`, call `send_email` for lockout notification, log `ACCOUNT_LOCKED`; return 401 `INVALID_CREDENTIALS`
    5. On success: reset `failed_login_attempts = 0`, set `user.last_login = now`
    6. Check `user.email_verified` → 403 `EMAIL_NOT_VERIFIED`
    7. Call `create_access_token`, insert `Session` row with matching `expires_at`
    8. Log `LOGIN_SUCCESS` with method=`"password"`
    9. Call `set_auth_cookie(response, token, remember_me)`, return `LoginResponse`
    - _Requirements: US-1, FR-1, FR-3, FR-9_

  - **POST `/register`** — rate limit 5/hour
    1. Call `validate_complexity(password)` → 422 if errors
    2. Check username uniqueness (case-insensitive) → 409 `USERNAME_ALREADY_EXISTS`
    3. Check email uniqueness (case-insensitive) → 409 `EMAIL_ALREADY_EXISTS`
    4. `hash_password`, create `User(role=VIEWER, email_verified=False, must_reset_password=False)`
    5. Create `EmailVerification(token=secrets.token_urlsafe(32), expires_at=now+24h)`
    6. Fire-and-forget `send_email` with verification link `{FRONTEND_URL}/verify-email?token={token}`
    7. Log `REGISTER`
    - Return 201 `MessageResponse`
    - _Requirements: US-4, FR-2, FR-6_

  - **POST `/verify-email`**
    1. Look up `EmailVerification` by token — 400 `INVALID_VERIFICATION_TOKEN` if not found or `verified_at` is set
    2. Check `expires_at > now` — 400 `VERIFICATION_TOKEN_EXPIRED`
    3. Set `verified_at = now`, set `user.email_verified = True`, commit
    4. Log `EMAIL_VERIFIED`
    - _Requirements: US-4, FR-6_

  - **POST `/logout`** — requires auth
    1. Extract `jti` from decoded token
    2. Find `Session` by `token_jti`, set `revoked_at = now`
    3. Call `clear_auth_cookie(response)`
    4. Log `LOGOUT`
    - Return 200 `MessageResponse("You have been logged out")`
    - _Requirements: US-10_

  - **GET `/me`** — requires auth
    - Return `UserResponse` for `current_user`
    - _Requirements: US-9, US-15_

  - **POST `/refresh`** — requires auth
    1. Get current session by jti, set `revoked_at = now`
    2. Issue new token with same `remember_me` window (infer from `expires_at - created_at`)
    3. Insert new `Session`, set new cookie
    4. Log `TOKEN_REFRESHED`
    - _Requirements: US-9, US-11_

  - **POST `/password-reset-request`** — rate limit 5/hour
    1. Look up user by email silently (never reveal whether email exists)
    2. If found: delete existing unused tokens for user, create new `PasswordResetToken(expires_at=now+1h)`, send reset email with `{FRONTEND_URL}/reset-password?token={token}`
    3. Log `PASSWORD_RESET_REQUEST` regardless
    - Return generic 200 message
    - _Requirements: US-6, FR-2_

  - **POST `/password-reset-confirm`**
    1. Look up token — 400 `INVALID_RESET_TOKEN` if not found or `used_at` is set
    2. Check `expires_at > now` — 400 `RESET_TOKEN_EXPIRED`
    3. `validate_complexity(new_password)` → 422 on failure
    4. `hash_password`, save to user; set `token.used_at = now`
    5. Revoke all sessions for user (`revoked_at = now` for all active sessions)
    6. Log `PASSWORD_RESET_COMPLETE`
    - _Requirements: US-7, FR-2_

  - **POST `/change-password`** — requires auth
    1. `verify_password(current_password, user.hashed_password)` → 401 on failure
    2. Check `new_password != current_password` → 422 if same
    3. `validate_complexity(new_password)` → 422 on failure
    4. `hash_password`, save; set `user.must_reset_password = False`
    5. Revoke all other sessions (not current jti)
    6. Log `PASSWORD_CHANGED`
    - _Requirements: US-8, US-7_

  - **GET `/sso/microsoft`**
    1. Generate `state = secrets.token_urlsafe(32)`
    2. Set `oauth_state` cookie: `httpOnly=True`, `SameSite=Lax`, `Max-Age=600`, `Path=/api/auth/sso`
    3. Return 302 redirect to Azure AD authorization URL (built by `oauth_client.get_microsoft_auth_url(state)`)
    - _Requirements: US-2, FR-4_

  - **GET `/sso/microsoft/callback`**
    1. Validate `state` query param == `oauth_state` cookie value → 400 `OAUTH_STATE_MISMATCH`
    2. Clear `oauth_state` cookie
    3. Exchange code via `oauth_client.exchange_microsoft_code`
    4. Fetch user info via `oauth_client.get_microsoft_user_info`
    5. Extract email from `mail` or `userPrincipalName`; look up user case-insensitively
    6. If not found: create `User(email=..., full_name=..., username=generate_sso_username(email), hashed_password="!", role=VIEWER, email_verified=True, sso_provider="microsoft")`
    7. Update `last_login`, issue JWT, create `Session`, set cookie
    8. Log `SSO_LOGIN` with `details={"provider": "microsoft"}`
    9. Redirect to `{FRONTEND_URL}/change-password` if `must_reset_password`, else `{FRONTEND_URL}/`
    - _Requirements: US-2, US-13, FR-4_

  - **GET `/sso/google`** — same pattern as Microsoft (uses Google URLs)
    - _Requirements: US-3, FR-5_

  - **GET `/sso/google/callback`** — same pattern as Microsoft callback
    - Additionally save `picture` claim to `user.profile_picture_url`
    - _Requirements: US-3, US-13, FR-5_

- [x] 4.2 Add `GET /api/auth/health` endpoint to auth router
  - Returns `{"status": "ok", "service": "auth"}` — no auth required
  - Used for health monitoring per NFR-4
  - _Requirements: NFR-4_

---

## Group 5: Admin Routes (Backend)

- [x] 5.1 Create `backend/app/admin/__init__.py`
  - Empty file to make `app/admin` a Python package
  - _Design ref: §2.1 — New File Structure_

- [x] 5.2 Create `backend/app/admin/router.py` — admin endpoints
  - Create `APIRouter(prefix="/admin", tags=["Admin"])`
  - All endpoints use `Depends(require_admin)` as a router-level default

  - **GET `/users`** — list all users
    - Accepts optional query params: `?role=`, `?active=`, `?search=` (search by username/email/full_name ILIKE)
    - Returns `list[UserResponse]`
    - _Requirements: US-12, US-5_

  - **POST `/users`** — create user
    1. Check username/email uniqueness → 409 on conflict
    2. If no password provided: call `generate_temp_password()`, set `must_reset_password=True`; else validate complexity
    3. `hash_password`, create `User`
    4. Send welcome email via `welcome_admin_created_html` (async, fire-and-forget)
    5. Log `REGISTER` with `details={"created_by_admin": admin_id}`
    - Returns 201 `UserResponse`
    - _Requirements: US-5, FR-2_

  - **PATCH `/users/{id}`** — update user
    1. Load user by id → 404 if not found
    2. Apply `role`, `active`, `full_name` changes from `UpdateUserRequest`
    3. If role changed: log `ROLE_CHANGED` with `details={"old_role": ..., "new_role": ...}`
    - Returns `UserResponse`
    - _Requirements: US-12, FR-8_

  - **DELETE `/users/{id}`** — soft-delete
    1. Load user → 404 if not found
    2. Prevent admin from deleting own account → 400
    3. Set `user.active = False`
    - Returns 200 `MessageResponse`
    - _Requirements: US-5_

  - **GET `/audit-logs`** — paginated audit logs
    - Query params: `?page=1&limit=50&event_type=&user_id=&from=&to=`
    - Returns `list[AuditLogResponse]` ordered by `created_at DESC`
    - _Requirements: US-12, FR-9_

---

## Group 6: Protect Existing Routes & Wire Up in main.py

- [x] 6.1 Add `get_current_user` dependency to all existing API route files
  - Files to update: `plants.py`, `sheds.py`, `sections.py`, `machines.py`, `meters.py`, `energy.py`, `alerts.py`, `metrics.py`, `reports.py`
  - In each file add import: `from app.auth.dependencies import get_current_user`
  - Add `from app.models.user import User` import
  - Add `_: User = Depends(get_current_user)` as final parameter to every route function
  - Example transformation for `plants.py`:
    ```python
    # Before
    def list_plants(active_only: bool = True, db: Session = Depends(get_db)):
    # After
    def list_plants(active_only: bool = True, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    ```
  - Apply same pattern to all functions in all 9 route files
  - _Design ref: §5.1 — Protecting Existing Routes_
  - _Requirements: US-14, FR-8_

- [x] 6.2 Add cookie-based auth to `backend/app/api/websocket.py`
  - Add imports: `from app.auth.jwt_handler import decode_access_token, get_token_from_request`, `from app.models.session import Session`, `from app.core.database import get_db`
  - Before `await websocket.accept()`, read `token = websocket.cookies.get("access_token")`
  - If no token: `await websocket.close(code=4001)` and return
  - Call `decode_access_token(token)` inside try/except — on `HTTPException`: close with code 4001 and return
  - Validate session is active in DB — close with 4001 if revoked
  - Only then call `await websocket.accept()`
  - _Design ref: §5.2 — WebSocket Authentication_
  - _Requirements: US-14_

- [x] 6.3 Register auth + admin routers and add middleware in `backend/app/main.py`
  - Add imports at top:
    ```python
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    from app.auth.router import router as auth_router
    from app.admin.router import router as admin_router
    ```
  - After `app = FastAPI(...)` instantiation, add:
    ```python
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    ```
  - Add custom `HTTPException` handler that unwraps dict details:
    ```python
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request, exc):
        detail = exc.detail
        if isinstance(detail, dict):
            return JSONResponse(status_code=exc.status_code, content=detail)
        return JSONResponse(status_code=exc.status_code,
                            content={"error": "ERROR", "message": str(detail), "details": None})
    ```
  - Register routers: `app.include_router(auth_router, prefix=prefix)` and `app.include_router(admin_router, prefix=prefix)`
  - Import `Session`, `PasswordResetToken`, `EmailVerification`, `AuthAuditLog` in the model import block so `create_all` picks them up
  - _Design ref: §2.9 — Rate Limiting, Error Handling_
  - _Requirements: NFR-2, NFR-4_

---

## Group 7: Frontend Auth Infrastructure

- [x] 7.1 Install new npm frontend dependencies
  - From `frontend/` directory:
    ```
    npm install react-hook-form@^7.51.0 zod@^3.23.0 @hookform/resolvers@^3.4.0
    ```
  - Verify existing `react-router-dom` v6 and `axios` are present in `package.json`
  - _Design ref: Appendix A — Frontend Dependencies_

- [~] 7.2 Update `frontend/src/api/client.ts` with auth support
  - Add `withCredentials: true` to the existing axios instance config (sends httpOnly cookies)
  - Add 401 refresh interceptor:
    - Track `isRefreshing` flag and `pendingRequests` queue (module-level)
    - On 401 and not `original._retry`: attempt `POST /auth/refresh`; if successful, replay queued requests
    - If refresh fails: redirect to `/login?reason=session_expired`
  - Keep existing response error logger intact
  - _Design ref: §3.4 — API Client with Cookie Support_
  - _Requirements: US-9, US-11_

- [~] 7.3 Create `frontend/src/api/auth.ts`
  - Import the updated `client` from `./client`
  - Export `authApi` object with functions:
    - `login(data)` → POST `/auth/login`, returns `{ user: AuthUser }`
    - `register(data)` → POST `/auth/register`, returns `{ message: string }`
    - `logout()` → POST `/auth/logout`
    - `me()` → GET `/auth/me`, returns `AuthUser`
    - `refresh()` → POST `/auth/refresh`
    - `verifyEmail(token)` → POST `/auth/verify-email`
    - `requestPasswordReset(email)` → POST `/auth/password-reset-request`
    - `confirmPasswordReset(data)` → POST `/auth/password-reset-confirm`
    - `changePassword(data)` → POST `/auth/change-password`
    - `ssoMicrosoft()` → `window.location.href = '/api/auth/sso/microsoft'`
    - `ssoGoogle()` → `window.location.href = '/api/auth/sso/google'`
  - Export `adminApi` object:
    - `listUsers(params?)` → GET `/admin/users`
    - `createUser(data)` → POST `/admin/users`
    - `updateUser(id, data)` → PATCH `/admin/users/{id}`
    - `deleteUser(id)` → DELETE `/admin/users/{id}`
    - `listAuditLogs(params?)` → GET `/admin/audit-logs`
  - _Design ref: §3.4 — `api/auth.ts`_

- [~] 7.4 Create `frontend/src/auth/AuthContext.tsx`
  - Define and export `UserRole` type union: `'ADMIN' | 'ENERGY_ENGINEER' | 'MAINTENANCE' | 'OPERATOR' | 'VIEWER'`
  - Define and export `AuthUser` interface with all fields from `UserResponse` backend schema
  - Define `AuthContextType` interface with `user`, `isLoading`, `isAuthenticated`, `login()`, `logout()`, `refreshUser()`
  - Create `AuthContext` via `createContext<AuthContextType | null>(null)`
  - Implement `AuthProvider` component:
    - On mount: call `authApi.me()`, set user on success, set null on error, always set `isLoading=false`
    - `login`: calls `authApi.login`, sets user from response
    - `logout`: calls `authApi.logout` (catch errors), sets user to null
    - `refreshUser`: calls `authApi.me()`, updates user state
  - _Design ref: §3.2 — AuthContext Design_
  - _Requirements: US-9, US-15_

- [~] 7.5 Create `frontend/src/auth/useAuth.ts`
  - Custom hook: `export function useAuth()` — reads `AuthContext` via `useContext`, throws if used outside `AuthProvider`
  - _Design ref: §3.1 — New File Structure_

- [~] 7.6 Create `frontend/src/auth/ProtectedRoute.tsx`
  - Props: `children: ReactNode`, `requiredRole?: UserRole | UserRole[]`
  - While `isLoading`: render a full-screen centered spinner (reuse existing design system styles: `bg-surface-950`, `text-brand-400`)
  - If not authenticated: `<Navigate to="/login" state={{ from: location }} replace />`
  - If `user.must_reset_password` and not on `/change-password`: `<Navigate to="/change-password" replace />`
  - If `requiredRole` provided and user's role not in allowed list: `<Navigate to="/unauthorized" replace />`
  - Otherwise: render `children`
  - _Design ref: §3.3 — Route Guard Pattern_
  - _Requirements: US-15, US-8_

- [~] 7.7 Create `frontend/src/auth/RoleGuard.tsx`
  - Props: `allowedRoles: UserRole[]`, `children: ReactNode`, `fallback?: ReactNode`
  - Reads `user` from `useAuth()`, returns `fallback` (default `null`) if user is null or role not in `allowedRoles`
  - Used to conditionally render sidebar nav items, action buttons, etc.
  - _Design ref: §3.3 — `RoleGuard.tsx`_
  - _Requirements: US-15, FR-8_

- [~] 7.8 Update `frontend/src/App.tsx` with new router structure
  - Wrap entire `<Routes>` in `<AuthProvider>`
  - Add public routes outside `<Layout>`:
    - `/login` → `<Login />`
    - `/register` → `<Register />`
    - `/forgot-password` → `<ForgotPassword />`
    - `/reset-password` → `<ResetPassword />`
    - `/verify-email` → `<VerifyEmail />`
    - `/unauthorized` → `<Unauthorized />`
  - Add `/change-password` route wrapped in `<ProtectedRoute>` but without `<Layout>` (full-screen form)
  - Wrap the existing `<Layout>` route in `<ProtectedRoute>` — all existing child routes remain unchanged
  - Add `/configuration` nested route wrapped with `<ProtectedRoute requiredRole="ADMIN">`
  - Add admin routes under `/admin` wrapped with `<ProtectedRoute requiredRole="ADMIN">`:
    - `users` → `<AdminUsers />`
    - `audit-logs` → `<AdminAuditLogs />`
  - Add `<Route path="*" element={<Navigate to="/" replace />}>`
  - Add redirect in authenticated user landing on `/login` → navigate to `/` (handled inside `Login.tsx`)
  - _Design ref: §3.5 — Router Structure_
  - _Requirements: US-15, US-14_

---

## Group 8: Auth Pages (Frontend)

- [~] 8.1 Create `frontend/src/components/auth/LoginForm.tsx`
  - Use `react-hook-form` with `zod` schema validation
  - Fields: `identifier` (text, autocomplete="username"), `password` (with show/hide eye-icon toggle, autocomplete="current-password"), `rememberMe` (checkbox)
  - Display inline field error messages
  - Show red error banner when `errorMessage` prop is set (e.g. "Invalid username or password")
  - Show loading spinner inside submit button when `isLoading` prop is true
  - On submit: call `onSubmit(identifier, password, rememberMe)` prop function
  - "Forgot password?" link navigates to `/forgot-password`
  - _Design ref: §3.6 — Landing Page Component Design_
  - _Requirements: US-1, NFR-5_

- [~] 8.2 Create `frontend/src/components/auth/SSOButtons.tsx`
  - Two buttons: "Sign in with Microsoft" and "Sign in with Google"
  - Use inline SVG logos (Microsoft 4-color squares grid, Google G logo)
  - Buttons use `surface-800` background, hover to `surface-700`, border `surface-700`
  - On click: call `authApi.ssoMicrosoft()` and `authApi.ssoGoogle()` respectively (causes full page redirect)
  - Accepts optional `disabled` prop (disable both buttons while a login is in progress)
  - _Design ref: §3.6 — `<SSOButtons>`_
  - _Requirements: US-2, US-3_

- [~] 8.3 Create `frontend/src/pages/Login.tsx`
  - Full-screen flex layout, `bg-surface-950`, no sidebar/nav
  - Left panel (hidden on mobile via `hidden lg:flex`, ~55% width):
    - EnergyIQ gradient icon + wordmark (same icon as Sidebar)
    - Tagline: "Intelligent Energy Management"
    - Subtitle: "Real-time monitoring for cable manufacturing plants"
    - 4 feature bullet points with Lucide icons
    - Dark industrial gradient background
  - Right panel (full width on mobile, ~45% on desktop, `flex items-center justify-center`):
    - Card: `bg-surface-900 border border-surface-800 rounded-xl shadow-2xl p-8 w-full max-w-[400px]`
    - "Welcome back" heading, "Sign in to EnergyIQ" subheading
    - `<LoginForm>` component wired to `useAuth().login()`
    - Divider: `<hr>` with "or continue with" label
    - `<SSOButtons>`
    - Footer link: "New to EnergyIQ? Create an account" → `/register`
  - Redirect logic: if `isAuthenticated`, navigate to `location.state.from?.pathname ?? '/'` (or `/change-password` if `must_reset_password`)
  - Show parsed error from API response in `LoginForm` error banner
  - _Design ref: §3.6 — Landing Page Component Design_
  - _Requirements: US-1, US-2, US-3, NFR-5_

- [~] 8.4 Create `frontend/src/components/auth/PasswordStrength.tsx`
  - Props: `password: string`
  - Compute strength score based on: length ≥ 8, uppercase, lowercase, digit, special char, length ≥ 12
  - Render labelled coloured bar: red (0–1 criteria = "Weak"), amber (2–3 = "Fair"), yellow (4 = "Good"), green (5–6 = "Strong")
  - Only render when `password.length > 0`
  - _Design ref: §3.1 — `components/auth/PasswordStrength.tsx`_
  - _Requirements: US-4, US-7, US-8_

- [~] 8.5 Create `frontend/src/pages/Register.tsx`
  - Form fields with `react-hook-form` + `zod`: Full Name, Email, Username (with availability check), Password (with `<PasswordStrength>`), Confirm Password
  - Username availability check: debounced 500ms, calls `GET /api/auth/check-username?username=...` (add this lightweight endpoint to auth router) or POST /register and parse 409 — use an async zod refinement
  - Password match validation inline
  - Submit button: "Create Account", shows spinner while loading
  - Back link: "Already have an account? Sign in" → `/login`
  - On success: show "Check your email to verify your account" message, do not redirect (stay on success state)
  - _Design ref: §3.1 — Registration Page, requirements.md — Registration Page_
  - _Requirements: US-4_

- [~] 8.6 Create `frontend/src/pages/ForgotPassword.tsx`
  - Single email input with `react-hook-form` + zod `EmailStr` validation
  - Submit button: "Send Reset Link", shows loading state
  - On success (any 200): show generic message: "If an account with that email exists, you'll receive a reset link shortly."
  - Link back to login: "Back to Sign In" → `/login`
  - _Design ref: requirements.md — Password Reset Pages_
  - _Requirements: US-6_

- [~] 8.7 Create `frontend/src/pages/ResetPassword.tsx`
  - Read `token` from `useSearchParams()` on mount; if missing → show "Invalid or expired link" error
  - Fields: New Password (with `<PasswordStrength>`), Confirm Password
  - On submit: call `authApi.confirmPasswordReset({ token, new_password, confirm_password })`
  - On success: show "Password changed successfully. Redirecting to login..." and navigate to `/login` after 3 seconds
  - On 400 `RESET_TOKEN_EXPIRED`: show "This link has expired. Request a new one." with link to `/forgot-password`
  - _Design ref: requirements.md — Password Reset Pages_
  - _Requirements: US-7_

- [~] 8.8 Create `frontend/src/pages/ChangePassword.tsx`
  - Full-screen centered card layout (no sidebar — this route is outside `<Layout>`)
  - Fields: Current Password, New Password (with `<PasswordStrength>`), Confirm New Password
  - No "Later" / skip button — user cannot bypass this
  - On submit: call `authApi.changePassword(...)`
  - On success: call `refreshUser()` then navigate to `/`
  - On 401: show "Current password is incorrect"
  - _Design ref: §3.5 — `/change-password` route, requirements.md — US-8_
  - _Requirements: US-8_

- [~] 8.9 Create `frontend/src/pages/VerifyEmail.tsx`
  - Read `token` from `useSearchParams()` on mount
  - On mount: automatically call `authApi.verifyEmail(token)` (no user action needed)
  - Show loading spinner while verifying
  - On success: show "Email verified successfully. You can now log in." with link to `/login`
  - On 400 `VERIFICATION_TOKEN_EXPIRED`: show "This verification link has expired." with "Resend verification email" option (POST to a new endpoint)
  - On 400 `INVALID_VERIFICATION_TOKEN`: show "Invalid or already used verification link."
  - _Design ref: §3.1 — `pages/VerifyEmail.tsx`_
  - _Requirements: US-4_

- [~] 8.10 Create `frontend/src/pages/Unauthorized.tsx`
  - Full-screen centered layout (can use `<Layout>` or standalone)
  - Show lock icon (Lucide `ShieldX`), "Access Denied" heading
  - Message: "You don't have permission to view this page."
  - Show user's current role in a badge
  - "Go to Dashboard" button → navigate to `/`
  - _Design ref: §3.1 — `pages/Unauthorized.tsx`_
  - _Requirements: US-15_

---

## Group 9: Session Management (Frontend)

- [~] 9.1 Create `frontend/src/hooks/useSessionTimeout.ts`
  - Read token expiry from `localStorage.getItem('token_exp')` — this value (Unix seconds) is written by `AuthContext` after a successful login (decode the JWT payload's `exp` field from the base64 cookie if possible, or have the backend return `expires_at` in the login response and store it)
  - Schedule a warning timer at `exp - 5min` that sets `showWarning = true`
  - Schedule a logout timer at `exp` that calls `logout()` and redirects to `/login?reason=session_expired`
  - Listen to user activity events (`mousemove`, `keydown`, `click`, `scroll`, `touchstart`) to reset timers
  - Implement `continueSession()`: calls `authApi.refresh()`, updates `localStorage token_exp`, reschedules timers
  - Clean up timers and event listeners on unmount
  - _Design ref: §3.7 — Session Timeout Logic_
  - _Requirements: US-11_

- [~] 9.2 Update `frontend/src/auth/AuthContext.tsx` to store token expiry
  - After successful `login()`, parse the JWT `exp` from the login response (backend should return `expires_at` as a Unix timestamp in the `LoginResponse`) and store it: `localStorage.setItem('token_exp', String(expiresAt))`
  - On `logout()`: remove `localStorage.removeItem('token_exp')`
  - _Design ref: §3.7 — `useSessionTimeout.ts`_
  - _Requirements: US-11_

- [~] 9.3 Create `frontend/src/components/auth/SessionWarning.tsx`
  - Modal component (overlay + centered card)
  - Message: "Your session will expire in 5 minutes. Continue working?"
  - "Continue" button → calls `continueSession()` prop function, closes modal
  - "Log out" button → calls `logout()` prop function
  - Uses existing `surface-900`/`surface-800`/`brand-600` design tokens
  - Accessible: `role="dialog"`, `aria-modal="true"`, focus trap, Escape key closes modal and logs out
  - _Design ref: §3.7 — SessionWarning_
  - _Requirements: US-11_

- [~] 9.4 Integrate session timeout into `frontend/src/components/layout/Layout.tsx`
  - Import and call `useSessionTimeout()` at top of `Layout` component
  - Render `<SessionWarning>` conditionally based on `showWarning`, passing `continueSession` and `logout`
  - _Design ref: §3.7 — `SessionWarning.tsx` note_
  - _Requirements: US-11_

- [~] 9.5 Update `frontend/src/components/layout/Sidebar.tsx` footer with user menu
  - Import `useAuth` from `../../auth/useAuth`
  - Replace the "Simulation Active" section in the expanded footer with a user info row:
    - Avatar circle: initials from `user.full_name` or `user.username`, or `<img>` if `profile_picture_url` is set (28×28px, rounded-full)
    - Full name (truncated) and role badge below it
    - Logout button (Lucide `LogOut` icon, 13px) on the right — calls `logout()`
  - Keep the collapse toggle button in place
  - Collapsed state: show just avatar circle (no name/role text)
  - _Design ref: §5.4 — Sidebar User Menu_
  - _Requirements: US-10, US-15_

---

## Group 10: Admin UI (Frontend)

- [~] 10.1 Create `frontend/src/pages/admin/AdminUsers.tsx`
  - Fetch user list on mount via `adminApi.listUsers()`
  - Display in a table with columns: Avatar, Name/Username, Email, Role (dropdown), Status (active badge), Created, Actions
  - Role dropdown per row: calls `adminApi.updateUser(id, { role })` on change, shows toast/inline confirmation
  - Status toggle: calls `adminApi.updateUser(id, { active })` on click
  - "Add User" button opens a modal form with fields from `CreateUserRequest` schema
  - Delete button: calls `adminApi.deleteUser(id)` after confirmation — soft-deletes (sets `active=False`)
  - Filtering: search input, role filter dropdown, active/inactive toggle filter
  - Use existing design tokens (table style matching existing app tables)
  - _Design ref: §2.4 — Admin Endpoints_
  - _Requirements: US-5, US-12_

- [~] 10.2 Create `frontend/src/pages/admin/AdminAuditLogs.tsx`
  - Fetch paginated audit logs via `adminApi.listAuditLogs({ page, limit, ...filters })`
  - Table columns: Timestamp, Event Type (coloured badge), User, IP Address, Details
  - Filter controls: event type dropdown, date range pickers (`from`/`to`), user search
  - Pagination: previous/next buttons, current page indicator
  - Event type badges: colour-coded (green for LOGIN_SUCCESS, red for LOGIN_FAILED, ACCOUNT_LOCKED, amber for PASSWORD_RESET_*, blue for ROLE_CHANGED, etc.)
  - Details column: expandable JSON viewer on row click
  - _Design ref: §2.4 — Admin Endpoints, `GET /audit-logs`_
  - _Requirements: US-12, FR-9_

- [~] 10.3 Add admin navigation links to `frontend/src/components/layout/Sidebar.tsx`
  - Import `RoleGuard` from `../../auth/RoleGuard`
  - Add admin nav items to `NAV_ITEMS` array or render a separate admin section below the main nav:
    - "User Management" → `/admin/users` (Lucide `Users` icon)
    - "Audit Logs" → `/admin/audit-logs` (Lucide `ScrollText` icon)
  - Wrap the admin nav section in `<RoleGuard allowedRoles={['ADMIN']}>` so it only renders for admins
  - Add a "ADMIN" section header label above the admin nav items
  - _Design ref: §5.4 — Sidebar User Menu, §3.3 — RoleGuard_
  - _Requirements: US-15, FR-8_

---

## Group 11: Testing

- [~] 11.1 Write backend unit tests for `password.py`
  - Create `backend/tests/auth/` directory with `__init__.py`
  - Create `backend/tests/auth/test_password.py`:
    - `test_hash_and_verify`: verify that `verify_password(plain, hash_password(plain))` returns `True`
    - `test_verify_wrong_password`: verify that `verify_password("wrong", hash_password("correct"))` returns `False`
    - `test_complexity_all_rules`: parametrized test covering each rule independently (too short, no uppercase, no lowercase, no digit, no special, too long)
    - `test_complexity_valid_password`: `validate_complexity("ValidPass1!")` returns empty list
    - `test_common_password_rejected`: `validate_complexity("password")` or `validate_complexity("123456")` returns non-empty list
    - `test_temp_password_passes_complexity`: `validate_complexity(generate_temp_password())` returns empty list (run 10 iterations)
    - `test_unusable_hash_never_verifies`: `verify_password("anything", "!")` returns `False`
  - _Design ref: §7.1 — Backend Unit Tests_
  - _Requirements: FR-2_

- [~] 11.2 Write backend unit tests for `jwt_handler.py`
  - Create `backend/tests/auth/test_jwt_handler.py`:
    - `test_create_and_decode_token`: create token, decode it, verify `sub`, `email`, `role`, `jti` fields
    - `test_expired_token_raises`: create token with `timedelta(seconds=-1)` expiry, assert `decode_access_token` raises `HTTPException(401)`
    - `test_tampered_signature_raises`: modify encoded token string, assert `HTTPException(401)` raised
    - `test_remember_me_expiry`: verify `create_access_token(..., remember_me=True)` sets `expires_at` ~7 days from now
    - `test_cookie_flags`: create a mock `Response`, call `set_auth_cookie`, inspect set cookie for `httponly=True`, `secure=True`, `samesite="strict"`
  - _Design ref: §7.1 — Backend Unit Tests_
  - _Requirements: FR-1, US-9_

- [~] 11.3 Write backend integration tests for login and registration flows
  - Create `backend/tests/auth/test_login.py` using `pytest` + `httpx.AsyncClient` + in-memory SQLite (or test PostgreSQL):
    - `test_login_success`: POST `/api/auth/login` with valid credentials → 200, `access_token` cookie set
    - `test_login_wrong_password`: POST with wrong password → 401 `INVALID_CREDENTIALS`
    - `test_login_account_lockout`: 5 failed attempts then 6th → 429 `ACCOUNT_LOCKED`
    - `test_login_unverified_email`: user with `email_verified=False` → 403 `EMAIL_NOT_VERIFIED`
    - `test_login_inactive_account`: user with `active=False` → 403 `ACCOUNT_INACTIVE`
    - `test_protected_route_no_auth`: GET `/api/plants` without cookie → 401
    - `test_protected_route_with_auth`: GET `/api/plants` with valid cookie → 200
    - `test_role_enforcement_forbidden`: VIEWER token POSTing to `/api/admin/users` → 403
    - `test_register_success`: POST `/api/auth/register` → 201
    - `test_register_duplicate_username`: register twice with same username → 409
    - `test_register_weak_password`: register with `"password"` → 422
    - `test_logout_revokes_session`: login, logout, then attempt protected request → 401 `TOKEN_REVOKED`
  - _Design ref: §7.2 — Backend Integration Tests_
  - _Requirements: US-1, US-4, US-10, US-14, FR-3_

- [~] 11.4 Write frontend unit tests for `AuthContext` and `ProtectedRoute`
  - Create `frontend/src/auth/__tests__/AuthContext.test.tsx`:
    - Mock `authApi.me()` — test that `isLoading=true` transitions to `isLoading=false` after mount
    - `me()` resolves: verify `user` is set and `isAuthenticated=true`
    - `me()` rejects (401): verify `user=null` and `isAuthenticated=false`
    - `login()`: mock `authApi.login()`, verify `user` state updated
    - `logout()`: verify `user` set to null, `authApi.logout` called
  - Create `frontend/src/auth/__tests__/ProtectedRoute.test.tsx`:
    - Unauthenticated: renders `<Navigate to="/login">` with location state
    - `must_reset_password=true` and not on `/change-password`: renders `<Navigate to="/change-password">`
    - `requiredRole` not matching user's role: renders `<Navigate to="/unauthorized">`
    - All conditions pass: renders `children`
    - `isLoading=true`: renders spinner, not children
  - Create `frontend/src/components/auth/__tests__/LoginForm.test.tsx`:
    - Empty submit: shows validation errors for required fields
    - Valid submit: calls `onSubmit` with correct values
    - `errorMessage` prop set: renders red error banner with text
    - Password eye toggle: changes input type from `password` to `text`
  - Use Vitest + React Testing Library + `@testing-library/user-event`
  - _Design ref: §7.3 — Frontend Unit Tests_
  - _Requirements: US-1, US-15_

---

## Checkpoint

- [~] 12.1 Final integration verification
  - Ensure all backend tests pass: `cd backend && pytest tests/auth/ -v`
  - Ensure frontend builds without TypeScript errors: `cd frontend && npm run build`
  - Run the app locally end-to-end:
    - Unauthenticated visit to `/` redirects to `/login`
    - Login with seed user credentials → lands on dashboard
    - Logout → redirects to `/login` with cookie cleared
    - Protected API routes return 401 without cookie
    - Authenticated API routes return 200 with valid cookie
  - Ensure all existing dashboard features still work for authenticated users (no regressions from `Depends(get_current_user)` additions)
  - Verify `alembic upgrade head` runs cleanly against a fresh database
  - Ask the user if any questions arise before closing the task.

## Notes

- **SSO setup required:** Before testing Groups 4 SSO endpoints, register the app in Azure AD Portal and Google Cloud Console. Add the callback URLs: `{BACKEND_URL}/api/auth/sso/microsoft/callback` and `{BACKEND_URL}/api/auth/sso/google/callback`.
- **SMTP setup:** For local development, leave SMTP vars empty — email functions return silently. Use a tool like Mailtrap or MailHog for dev email testing.
- **JWT secret key:** Generate with `python -c "import secrets; print(secrets.token_hex(32))"` — must be set in Railway env vars before deployment.
- **Existing seed users:** The Alembic migration sets `email_verified=True` for all existing users so they are not locked out after migration.
- **Rolling deployment:** Groups 1–6 (backend) can be deployed and tested before Groups 7–10 (frontend). The existing dashboard will become inaccessible until a valid session cookie exists — consider deploying frontend auth changes together with backend in the same release.
- **Common passwords file:** Download from [SecLists](https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/10-million-password-list-top-10000.txt) and save as `backend/app/auth/common_passwords.txt`.
