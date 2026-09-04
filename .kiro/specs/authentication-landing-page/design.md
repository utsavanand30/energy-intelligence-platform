
## Overview

This document describes the technical design for the Authentication & Landing Page feature for the Energy Intelligence Platform (EnergyIQ). It covers the backend auth service (FastAPI), OAuth 2.0 SSO integration (Microsoft Azure AD and Google Workspace), JWT-based session management using httpOnly cookies, PostgreSQL session store, SMTP email service, and the React frontend auth context, route guards, and login UI.

The implementation replaces the current unauthenticated direct-to-dashboard flow with a secure, role-aware login system that supports both traditional username/password login and enterprise SSO.

**Decisions from finalised requirements:**
- Token storage: httpOnly cookie set by backend (`Set-Cookie` header)
- Session store: PostgreSQL `sessions` table (existing Railway DB)
- Email: SMTP via `aiosmtplib`
- SSO providers: Microsoft Azure AD + Google Workspace (OAuth 2.0)
- Default role for new SSO users: VIEWER, requires admin approval to elevate
- Account deletion: admin-only

# Design Document

**Feature ID:** `authentication-landing-page`  
**Status:** Draft  
**Created:** 2026-09-04  
**Based on:** requirements.md (finalised ✅)

---

## Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│                                                                     │
│  ┌──────────────┐   httpOnly cookie    ┌────────────────────────┐  │
│  │  React SPA   │ ──────────────────── │   Axios (withCreds)    │  │
│  │  (Vite)      │                      │   + 401 interceptor     │  │
│  └──────────────┘                      └───────────┬────────────┘  │
└──────────────────────────────────────────────────── │ ─────────────┘
                                                       │ HTTPS
┌──────────────────────────────────────────────────── │ ─────────────┐
│  Railway / Koyeb                                     │              │
│                                                       ▼              │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  FastAPI                                                        │ │
│  │                                                                 │ │
│  │  /api/auth/*   ──►  auth/router.py  ──►  jwt_handler.py        │ │
│  │                                      ──►  password.py          │ │
│  │                                      ──►  email_service.py     │ │
│  │                                      ──►  oauth_client.py      │ │
│  │                                                                 │ │
│  │  /api/admin/*  ──►  admin/router.py                            │ │
│  │                                                                 │ │
│  │  /api/*        ──►  existing routers  (+ get_current_user dep) │ │
│  │                                                                 │ │
│  │  Depends(get_current_user)  ◄──  auth/dependencies.py          │ │
│  └────────────────────────┬───────────────────────────────────────┘ │
│                            │ SQLAlchemy ORM                          │
│  ┌─────────────────────────▼──────────────────────────────────────┐ │
│  │  PostgreSQL (Railway)                                           │ │
│  │  tables: users · sessions · password_reset_tokens ·            │ │
│  │          email_verifications · auth_audit_logs                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌──────────────────────────────┐                                   │
│  │  SMTP server (aiosmtplib)    │  (email verification / reset)     │
│  └──────────────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
              │ OAuth 2.0 redirect
     ┌────────┴─────────┐
     │  Azure AD /       │
     │  Google OAuth     │
     └──────────────────┘
```

### How Auth Fits into the Existing Architecture

The existing FastAPI app in `backend/app/main.py` registers routers under `/api` with no authentication middleware. The plan:

1. Add two new sub-packages: `app/auth/` and `app/admin/`.
2. Register their routers in `main.py` alongside the existing ones.
3. Add a single `Depends(get_current_user)` to every existing router function. Initially this only checks that a valid, non-revoked JWT exists — no role gating — so existing functionality is unaffected for authenticated users.
4. The React SPA wraps all existing routes in a `<ProtectedRoute>` component. Public routes (`/login`, `/register`, etc.) sit outside `<Layout>` so the sidebar is never shown when unauthenticated.

### Request Flow: Login (Traditional)

```
Browser                  FastAPI                    PostgreSQL
  │                         │                           │
  │  POST /api/auth/login   │                           │
  │  {identifier, password} │                           │
  │ ───────────────────────►│                           │
  │                         │  SELECT * FROM users      │
  │                         │  WHERE username=... OR email=...
  │                         │ ─────────────────────────►│
  │                         │◄──────────────────────────│
  │                         │  bcrypt.verify(pwd, hash) │
  │                         │  check lockout / attempts │
  │                         │  INSERT INTO sessions     │
  │                         │ ─────────────────────────►│
  │                         │  encode JWT (jti = uuid4) │
  │  Set-Cookie: access_token=<jwt>; HttpOnly; Secure   │
  │◄────────────────────────│                           │
  │  200 { user: {...} }    │                           │
```

---

## Components and Interfaces

### 2. Backend Design

### 2.1 New File Structure

```
backend/app/
├── auth/
│   ├── __init__.py
│   ├── router.py            # /api/auth/* endpoints
│   ├── dependencies.py      # get_current_user(), require_role() FastAPI deps
│   ├── jwt_handler.py       # encode/decode JWT, cookie read/write helpers
│   ├── password.py          # bcrypt hash/verify, complexity validation, common-passwords check
│   ├── oauth_client.py      # Microsoft Azure AD + Google OAuth 2.0 (authlib Starlette)
│   └── email_service.py     # aiosmtplib async SMTP sender + HTML templates
├── admin/
│   ├── __init__.py
│   └── router.py            # /api/admin/* endpoints (user management, audit logs)
├── models/
│   ├── user.py              # EXTENDED — new columns added via Alembic
│   ├── session.py           # NEW
│   ├── password_reset_token.py  # NEW
│   └── email_verification.py    # NEW
│   └── auth_audit_log.py    # NEW
├── schemas/
│   └── auth.py              # NEW — all Pydantic request/response schemas for auth
├── api/
│   └── routes/
│       └── ... (existing)   # each file gains Depends(get_current_user)
├── core/
│   └── config.py            # EXTENDED — new env vars added
└── main.py                  # EXTENDED — registers auth + admin routers, slowapi limiter
```

## Data Models

### 2.2 Database Models (SQLAlchemy)

#### `app/models/user.py` — Extended

New columns are added via Alembic migration. The model definition gains:

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    ENERGY_ENGINEER = "ENERGY_ENGINEER"
    MAINTENANCE = "MAINTENANCE"
    OPERATOR = "OPERATOR"
    VIEWER = "VIEWER"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), nullable=False, unique=True, index=True)
    email = Column(String(200), nullable=True, unique=True)
    full_name = Column(String(200), nullable=True)
    hashed_password = Column(String(200), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.VIEWER, nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

    # ── New auth columns (Phase 10) ────────────────────────────────────────
    must_reset_password = Column(Boolean, default=False, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    sso_provider = Column(String(50), nullable=True)      # 'microsoft' | 'google' | None
    profile_picture_url = Column(String(500), nullable=True)
    failed_login_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime(timezone=True), nullable=True)
```

#### `app/models/session.py` — New

```python
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_jti = Column(String(100), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    last_activity = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="sessions")

    @property
    def is_active(self) -> bool:
        from datetime import datetime, timezone
        return self.revoked_at is None and self.expires_at > datetime.now(timezone.utc)
```

Also add `sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")` to the `User` model.

#### `app/models/password_reset_token.py` — New

```python
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(100), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
```

#### `app/models/email_verification.py` — New

```python
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(100), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
```

#### `app/models/auth_audit_log.py` — New

```python
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class AuthEventType(str, enum.Enum):
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    REGISTER = "REGISTER"
    EMAIL_VERIFIED = "EMAIL_VERIFIED"
    PASSWORD_RESET_REQUEST = "PASSWORD_RESET_REQUEST"
    PASSWORD_RESET_COMPLETE = "PASSWORD_RESET_COMPLETE"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    ROLE_CHANGED = "ROLE_CHANGED"
    ACCOUNT_LOCKED = "ACCOUNT_LOCKED"
    SSO_LOGIN = "SSO_LOGIN"
    TOKEN_REFRESHED = "TOKEN_REFRESHED"


class AuthAuditLog(Base):
    __tablename__ = "auth_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)    # supports IPv6
    user_agent = Column(String(500), nullable=True)
    details = Column(JSON, nullable=True)             # {username, reason, old_role, new_role, …}
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
```

### 2.3 Alembic Migration

Create one migration file at `backend/alembic/versions/<timestamp>_add_auth_tables.py`:

```python
"""add auth tables

Revision ID: <auto-generated>
Revises: <previous>
Create Date: <auto-generated>
"""
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    # ── users table — new columns ──────────────────────────────────────────
    op.add_column("users", sa.Column("must_reset_password",    sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("users", sa.Column("email_verified",         sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("users", sa.Column("sso_provider",           sa.String(50),  nullable=True))
    op.add_column("users", sa.Column("profile_picture_url",    sa.String(500), nullable=True))
    op.add_column("users", sa.Column("failed_login_attempts",  sa.Integer(),  nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until",           sa.DateTime(timezone=True), nullable=True))

    # Existing seed users: treat as verified, no forced reset
    op.execute("UPDATE users SET email_verified = true, must_reset_password = false")

    # ── sessions ───────────────────────────────────────────────────────────
    op.create_table(
        "sessions",
        sa.Column("id",            sa.Integer(),  primary_key=True),
        sa.Column("user_id",       sa.Integer(),  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_jti",     sa.String(100), unique=True, nullable=False),
        sa.Column("created_at",    sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at",    sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_activity", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("revoked_at",    sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sessions_user_id",   "sessions", ["user_id"])
    op.create_index("ix_sessions_token_jti", "sessions", ["token_jti"])
    op.create_index("ix_sessions_expires_at","sessions", ["expires_at"])

    # ── password_reset_tokens ──────────────────────────────────────────────
    op.create_table(
        "password_reset_tokens",
        sa.Column("id",         sa.Integer(),  primary_key=True),
        sa.Column("user_id",    sa.Integer(),  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token",      sa.String(100), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_prt_token", "password_reset_tokens", ["token"])

    # ── email_verifications ────────────────────────────────────────────────
    op.create_table(
        "email_verifications",
        sa.Column("id",          sa.Integer(),  primary_key=True),
        sa.Column("user_id",     sa.Integer(),  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token",       sa.String(100), unique=True, nullable=False),
        sa.Column("expires_at",  sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_ev_token", "email_verifications", ["token"])

    # ── auth_audit_logs ────────────────────────────────────────────────────
    op.create_table(
        "auth_audit_logs",
        sa.Column("id",          sa.Integer(),  primary_key=True),
        sa.Column("user_id",     sa.Integer(),  sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type",  sa.String(50), nullable=False),
        sa.Column("ip_address",  sa.String(45), nullable=True),
        sa.Column("user_agent",  sa.String(500), nullable=True),
        sa.Column("details",     sa.JSON(),     nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_aal_user_id",    "auth_audit_logs", ["user_id"])
    op.create_index("ix_aal_event_type", "auth_audit_logs", ["event_type"])
    op.create_index("ix_aal_created_at", "auth_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("auth_audit_logs")
    op.drop_table("email_verifications")
    op.drop_table("password_reset_tokens")
    op.drop_table("sessions")
    for col in ["locked_until", "failed_login_attempts", "profile_picture_url",
                "sso_provider", "email_verified", "must_reset_password"]:
        op.drop_column("users", col)
```

### 2.4 API Endpoint Specifications

All schemas live in `app/schemas/auth.py`.

#### Pydantic Schemas

```python
# ── Request schemas ──────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    identifier: str          # username OR email
    password: str
    remember_me: bool = False

class RegisterRequest(BaseModel):
    full_name: str           = Field(min_length=2, max_length=200)
    email: EmailStr
    username: str            = Field(min_length=3, max_length=100, pattern=r'^[a-zA-Z0-9_-]+$')
    password: str            = Field(min_length=8, max_length=128)
    confirm_password: str

    @model_validator(mode='after')
    def passwords_match(self) -> 'RegisterRequest':
        if self.password != self.confirm_password:
            raise ValueError('Passwords do not match')
        return self

class PasswordResetRequestSchema(BaseModel):
    email: EmailStr

class PasswordResetConfirmSchema(BaseModel):
    token: str
    new_password: str  = Field(min_length=8, max_length=128)
    confirm_password: str

    @model_validator(mode='after')
    def passwords_match(self) -> 'PasswordResetConfirmSchema':
        if self.new_password != self.confirm_password:
            raise ValueError('Passwords do not match')
        return self

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str  = Field(min_length=8, max_length=128)
    confirm_password: str

    @model_validator(mode='after')
    def passwords_match(self) -> 'ChangePasswordRequest':
        if self.new_password != self.confirm_password:
            raise ValueError('Passwords do not match')
        return self

class VerifyEmailRequest(BaseModel):
    token: str

# ── Response schemas ─────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    full_name: Optional[str]
    role: UserRole
    must_reset_password: bool
    email_verified: bool
    sso_provider: Optional[str]
    profile_picture_url: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True

class LoginResponse(BaseModel):
    user: UserResponse
    message: str = "Login successful"

class MessageResponse(BaseModel):
    message: str

class ErrorResponse(BaseModel):
    error: str
    message: str
    details: Optional[Any] = None

# ── Admin schemas ─────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str     = Field(min_length=3, max_length=100)
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: UserRole    = UserRole.VIEWER
    password: Optional[str] = None   # system generates 16-char if omitted

class UpdateUserRequest(BaseModel):
    role: Optional[UserRole] = None
    active: Optional[bool]   = None
    full_name: Optional[str] = None

class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    event_type: str
    ip_address: Optional[str]
    details: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True
```

#### `POST /api/auth/login`

- **Auth required:** No
- **Rate limit:** 10 req / IP / minute (slowapi)
- **Request:** `LoginRequest`
- **Logic:**
  1. Look up user by `username` OR `email` (case-insensitive for email).
  2. Check `user.active`. If False → `{"error": "ACCOUNT_INACTIVE", "message": "Account is disabled"}` 403.
  3. Check `user.locked_until`. If in the future → `{"error": "ACCOUNT_LOCKED", "message": "Account locked. Try again after {locked_until}"}` 429.
  4. `bcrypt.verify(request.password, user.hashed_password)`. If fail → increment `failed_login_attempts`. If `>= 5` set `locked_until = now + 15min`, send lockout email, log `ACCOUNT_LOCKED`. Return `{"error": "INVALID_CREDENTIALS", "message": "Invalid username or password"}` 401.
  5. On success: reset `failed_login_attempts = 0`, set `user.last_login = now`.
  6. Check `user.email_verified`. If False → `{"error": "EMAIL_NOT_VERIFIED", "message": "Please verify your email before logging in"}` 403.
  7. Generate JWT (see §2.5). Insert `Session` row with `expires_at = now + 8h` (or `+ 7d` if `remember_me`).
  8. Log `LOGIN_SUCCESS`.
  9. Set httpOnly cookie (see §2.6). Return `LoginResponse`.
- **Response:** `200 LoginResponse`
- **Error responses:** `401 INVALID_CREDENTIALS`, `403 ACCOUNT_INACTIVE`, `403 EMAIL_NOT_VERIFIED`, `429 ACCOUNT_LOCKED`

#### `POST /api/auth/register`

- **Auth required:** No
- **Rate limit:** 5 req / IP / hour
- **Request:** `RegisterRequest`
- **Logic:**
  1. Validate password complexity (see §2.4 password.py).
  2. Check username uniqueness (case-insensitive). If taken → `USERNAME_ALREADY_EXISTS` 409.
  3. Check email uniqueness (case-insensitive). If taken → `EMAIL_ALREADY_EXISTS` 409.
  4. Hash password with bcrypt cost 12.
  5. Create `User` with `email_verified=False`, `must_reset_password=False`, `role=VIEWER`.
  6. Create `EmailVerification` row (token = `secrets.token_urlsafe(32)`, expires in 24h).
  7. Send verification email asynchronously.
  8. Log `REGISTER` audit event.
- **Response:** `201 {"message": "Account created. Check your email to verify your account."}`
- **Error responses:** `409 USERNAME_ALREADY_EXISTS`, `409 EMAIL_ALREADY_EXISTS`, `422 validation error`

#### `POST /api/auth/verify-email`

- **Auth required:** No
- **Request:** `VerifyEmailRequest`
- **Logic:**
  1. Look up `EmailVerification` by token.
  2. If not found or `verified_at` is set → `INVALID_VERIFICATION_TOKEN` 400.
  3. If `expires_at < now` → `VERIFICATION_TOKEN_EXPIRED` 400. (Offer resend endpoint.)
  4. Set `verified_at = now`, set `user.email_verified = True`.
  5. Log `EMAIL_VERIFIED`.
- **Response:** `200 {"message": "Email verified successfully. You can now log in."}`

#### `POST /api/auth/logout`

- **Auth required:** Yes (valid JWT in cookie)
- **Request:** Empty body
- **Logic:**
  1. Extract `jti` from JWT.
  2. Find `Session` by `token_jti`, set `revoked_at = now`.
  3. Clear `access_token` cookie (`max_age=0`).
  4. Log `LOGOUT`.
- **Response:** `200 {"message": "You have been logged out"}`

#### `GET /api/auth/me`

- **Auth required:** Yes
- **Request:** No body (token read from cookie)
- **Response:** `200 UserResponse`

#### `POST /api/auth/refresh`

- **Auth required:** Yes (token may be near-expiry but not yet expired)
- **Logic:**
  1. Validate current JWT and session.
  2. Revoke current session (`revoked_at = now`).
  3. Issue new JWT + new Session row with the same `expires_at` window.
  4. Set new cookie.
  5. Log `TOKEN_REFRESHED`.
- **Response:** `200 {"message": "Token refreshed"}` + new `Set-Cookie`

#### `GET /api/auth/sso/microsoft`

- **Auth required:** No
- **Logic:**
  1. Generate `state = secrets.token_urlsafe(32)`.
  2. Store state in a short-lived signed cookie `oauth_state` (10min, httpOnly, SameSite=Lax).
  3. Build Azure AD authorization URL with `state`.
  4. Return `302 Redirect` to Azure AD.
- **Response:** `302 Location: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?...`

#### `GET /api/auth/sso/microsoft/callback`

- **Auth required:** No
- **Query params:** `code`, `state`, optional `error`
- **Logic:**
  1. Validate `state` matches `oauth_state` cookie. If mismatch → `OAUTH_STATE_MISMATCH` 400.
  2. Clear `oauth_state` cookie.
  3. Exchange `code` for tokens via `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`.
  4. Fetch user info from `https://graph.microsoft.com/v1.0/me` (email, displayName).
  5. Look up user by email (case-insensitive). If not found → create with `role=VIEWER`, `email_verified=True`, `sso_provider='microsoft'`.
  6. Update `last_login`, issue JWT, insert Session, set cookie.
  7. Log `SSO_LOGIN`.
  8. Redirect to `{FRONTEND_URL}/` (or `/change-password` if `must_reset_password`).
- **Response:** `302 Location: {FRONTEND_URL}`

#### `GET /api/auth/sso/google`

Same pattern as Microsoft. Redirect to `https://accounts.google.com/o/oauth2/v2/auth`.

#### `GET /api/auth/sso/google/callback`

Same pattern as Microsoft callback. Fetch user info from `https://www.googleapis.com/oauth2/v3/userinfo`. Also save `picture` claim to `profile_picture_url`.

#### `POST /api/auth/password-reset-request`

- **Auth required:** No
- **Rate limit:** 5 req / email / hour
- **Request:** `PasswordResetRequestSchema`
- **Logic:**
  1. Look up user by email silently (no enumeration).
  2. If user exists: delete existing unused tokens, create new `PasswordResetToken` (expires 1h), send email.
  3. Log `PASSWORD_RESET_REQUEST` (regardless of whether email exists).
- **Response:** `200 {"message": "If an account with that email exists, you'll receive a reset link shortly."}`

#### `POST /api/auth/password-reset-confirm`

- **Auth required:** No
- **Request:** `PasswordResetConfirmSchema`
- **Logic:**
  1. Look up token. If not found or `used_at` set → `INVALID_RESET_TOKEN` 400.
  2. If `expires_at < now` → `RESET_TOKEN_EXPIRED` 400.
  3. Validate new password complexity.
  4. Hash and save new password. Set `token.used_at = now`.
  5. Revoke all existing sessions for the user (`revoked_at = now`).
  6. Log `PASSWORD_RESET_COMPLETE`.
- **Response:** `200 {"message": "Password changed successfully."}`

#### `POST /api/auth/change-password`

- **Auth required:** Yes
- **Request:** `ChangePasswordRequest`
- **Logic:**
  1. Verify `current_password` against stored hash.
  2. Ensure `new_password != current_password`.
  3. Validate complexity, hash, save.
  4. Set `must_reset_password = False`.
  5. Revoke all other sessions.
  6. Log `PASSWORD_CHANGED`.
- **Response:** `200 {"message": "Password changed successfully."}`

#### Admin Endpoints (`/api/admin/*`)

All require `require_role(UserRole.ADMIN)`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/users` | List all users. Response: `list[UserResponse]`. Supports `?role=&active=&search=` query params. |
| `POST` | `/api/admin/users` | Create user. Request: `CreateUserRequest`. Generates 16-char temp password if omitted, sets `must_reset_password=True`. Sends welcome email. |
| `PATCH` | `/api/admin/users/{id}` | Update role/active/name. Request: `UpdateUserRequest`. Logs `ROLE_CHANGED` if role changed. |
| `DELETE` | `/api/admin/users/{id}` | Soft-delete (set `active=False`). Cannot delete own account. |
| `GET` | `/api/admin/audit-logs` | Paginated audit log. Query params: `?page=1&limit=50&event_type=&user_id=&from=&to=`. Response: `list[AuditLogResponse]`. |

### 2.5 JWT Structure

```json
{
  "sub": "42",
  "email": "user@polycab.com",
  "role": "ENERGY_ENGINEER",
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "exp": 1700028800,
  "iat": 1700000000
}
```

- `sub`: string user ID (not integer, per JWT spec)
- `jti`: UUID v4, used as the session identifier in the `sessions` table
- `exp`: Unix timestamp; 8h from `iat` (or 7d if `remember_me`)
- Algorithm: `HS256` (configurable to `RS256` via `JWT_ALGORITHM` env var)
- Secret: minimum 256-bit random value from `JWT_SECRET_KEY` env var

#### `app/auth/jwt_handler.py`

```python
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from fastapi import HTTPException, Request, status

from app.core.config import settings


def create_access_token(
    user_id: int,
    email: str,
    role: str,
    remember_me: bool = False,
) -> tuple[str, str, datetime]:
    """Returns (encoded_token, jti, expires_at)."""
    jti = str(uuid.uuid4())
    expires_delta = timedelta(days=7) if remember_me else timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    expires_at = datetime.now(timezone.utc) + expires_delta

    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "jti": jti,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, jti, expires_at


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={
            "error": "TOKEN_INVALID", "message": "Invalid or expired token"
        })


def set_auth_cookie(response, token: str, remember_me: bool = False) -> None:
    max_age = 60 * 60 * 24 * 7 if remember_me else 60 * 60 * 8
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=max_age,
        path="/",
    )


def clear_auth_cookie(response) -> None:
    response.delete_cookie(key="access_token", path="/", samesite="strict")


def get_token_from_request(request: Request) -> Optional[str]:
    return request.cookies.get("access_token")
```

### 2.6 Cookie Configuration

```python
response.set_cookie(
    key="access_token",
    value=token,
    httponly=True,      # no JS access — XSS protection
    secure=True,        # HTTPS only — Railway enforces this
    samesite="strict",  # CSRF protection
    max_age=28800,      # 8 hours (default)
    path="/",           # accessible to all routes
)
# With remember_me:
#   max_age=604800      # 7 days
```

The cookie is cleared on logout by calling `response.delete_cookie("access_token")`.

### 2.7 OAuth 2.0 Flow (Microsoft & Google)

#### State Parameter (CSRF Protection)

```
1. Browser → GET /api/auth/sso/microsoft
2. Backend:
   - state = secrets.token_urlsafe(32)
   - Set-Cookie: oauth_state=<state>; HttpOnly; SameSite=Lax; Max-Age=600; Path=/api/auth/sso
   - 302 → https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/authorize
             ?client_id={AZURE_CLIENT_ID}
             &response_type=code
             &redirect_uri={BASE_URL}/api/auth/sso/microsoft/callback
             &scope=openid profile email
             &state={state}
             &response_mode=query

3. Azure AD authenticates user
4. Azure AD → GET /api/auth/sso/microsoft/callback?code=...&state=...

5. Backend:
   - Read state from oauth_state cookie
   - Assert request.query_params["state"] == cookie_state
   - Clear oauth_state cookie
   - POST to https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/token
     body: {grant_type: authorization_code, code: ..., redirect_uri: ...,
            client_id: ..., client_secret: ...}
   - GET https://graph.microsoft.com/v1.0/me
     headers: {Authorization: Bearer {access_token}}
     → {id, displayName, mail, userPrincipalName}

6. Backend:
   - email = claims["mail"] or claims["userPrincipalName"]
   - user = db.query(User).filter(func.lower(User.email) == email.lower()).first()
   - if not user:
       create User(email=email, full_name=claims["displayName"],
                   username=generate_username(email), hashed_password=unusable_hash,
                   role=VIEWER, email_verified=True, sso_provider="microsoft")
   - issue JWT, create Session, set cookie
   - log SSO_LOGIN
   - 302 → {FRONTEND_URL}/  (or /change-password)
```

#### Unusable Password for SSO Users

SSO users have no local password. Store `hashed_password = "!"` (bcrypt will never verify this). This prevents password-based login for SSO-only accounts while satisfying the `NOT NULL` constraint.

#### Google Flow

Same as Microsoft with these differences:
- Auth URL: `https://accounts.google.com/o/oauth2/v2/auth?hd={GOOGLE_WORKSPACE_DOMAIN}` (optional `hd` for Workspace-only restriction)
- Token URL: `https://oauth2.googleapis.com/token`
- Userinfo URL: `https://www.googleapis.com/oauth2/v3/userinfo` → `{sub, email, name, picture}`
- Save `picture` → `user.profile_picture_url`
- `sso_provider = "google"`

### 2.8 FastAPI Dependencies

#### `app/auth/dependencies.py`

```python
from typing import Callable
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.session import Session
from app.auth.jwt_handler import decode_access_token, get_token_from_request


async def get_current_user(
    request: Request,
    db: DBSession = Depends(get_db),
) -> User:
    token = get_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "Authentication required"},
        )

    payload = decode_access_token(token)
    jti: str = payload.get("jti")
    user_id: int = int(payload.get("sub"))

    # Check session not revoked
    session = db.query(Session).filter(Session.token_jti == jti).first()
    if not session or not session.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "TOKEN_REVOKED", "message": "Session has been revoked"},
        )

    # Update last_activity (fire-and-forget, no await needed with sync ORM)
    session.last_activity = datetime.now(timezone.utc)
    db.commit()

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "User not found or inactive"},
        )

    return user


def require_role(*roles: UserRole) -> Callable:
    """Returns a FastAPI dependency that enforces one of the given roles."""
    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "FORBIDDEN", "message": "Insufficient permissions"},
            )
        return current_user
    return role_checker


# Convenience aliases
require_admin         = require_role(UserRole.ADMIN)
require_maintenance   = require_role(UserRole.ADMIN, UserRole.ENERGY_ENGINEER, UserRole.MAINTENANCE)
require_energy_eng    = require_role(UserRole.ADMIN, UserRole.ENERGY_ENGINEER)
require_operator_plus = require_role(UserRole.ADMIN, UserRole.ENERGY_ENGINEER, UserRole.MAINTENANCE, UserRole.OPERATOR)
```

#### Protecting Existing Routes

Each existing router file gains a default dependency injection. Example for `plants.py`:

```python
# Before:
@router.get("/plants")
def list_plants(db: Session = Depends(get_db)):
    ...

# After:
@router.get("/plants")
def list_plants(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),   # any authenticated user
):
    ...
```

For role-restricted endpoints, replace `Depends(get_current_user)` with `Depends(require_maintenance)` etc.

### 2.9 Rate Limiting

Use `slowapi` (FastAPI-compatible wrapper around `limits`).

```python
# main.py additions
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

```python
# auth/router.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    ...

@router.post("/register")
@limiter.limit("5/hour")
async def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    ...

@router.post("/password-reset-request")
@limiter.limit("5/hour")
async def password_reset_request(request: Request, ...):
    ...
```

### 2.10 SMTP Email Service

#### `app/auth/email_service.py`

```python
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.core.config import settings


async def send_email(to: str, subject: str, html_body: str) -> None:
    """Send an HTML email via SMTP. Fails silently in dev if SMTP not configured."""
    if not settings.SMTP_HOST:
        return  # dev: no email server configured

    message = MIMEMultipart("alternative")
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
    message["To"] = to
    message["Subject"] = subject
    message.attach(MIMEText(html_body, "html"))

    await aiosmtplib.send(
        message,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        use_tls=(settings.SMTP_PORT == 465),
        start_tls=(settings.SMTP_PORT == 587),
    )


# ── Email templates ──────────────────────────────────────────────────────

def email_verification_html(full_name: str, verify_link: str) -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto">
      <h2>Verify your EnergyIQ account</h2>
      <p>Hi {full_name},</p>
      <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
      <a href="{verify_link}" style="background:#3b82f6;color:#fff;padding:12px 24px;
         border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a>
      <p style="color:#64748b;font-size:12px">If you didn't create an account, you can safely ignore this email.</p>
    </div>"""


def password_reset_html(verify_link: str) -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto">
      <h2>Reset your EnergyIQ password</h2>
      <p>Click below to reset your password. This link expires in 1 hour and can only be used once.</p>
      <a href="{verify_link}" style="background:#ef4444;color:#fff;padding:12px 24px;
         border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a>
      <p style="color:#64748b;font-size:12px">If you didn't request a reset, ignore this email.</p>
    </div>"""


def welcome_admin_created_html(username: str, temp_password: str, login_url: str) -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto">
      <h2>Welcome to EnergyIQ</h2>
      <p>An account has been created for you. Sign in with the credentials below:</p>
      <table style="background:#f1f5f9;padding:16px;border-radius:6px">
        <tr><td><b>Username:</b></td><td>{username}</td></tr>
        <tr><td><b>Password:</b></td><td style="font-family:monospace">{temp_password}</td></tr>
      </table>
      <p>You will be required to change your password on first login.</p>
      <a href="{login_url}" style="background:#3b82f6;color:#fff;padding:12px 24px;
         border-radius:6px;text-decoration:none;display:inline-block">Sign In</a>
    </div>"""


def account_lockout_html(username: str, unlock_time: str) -> str:
    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto">
      <h2>EnergyIQ Account Locked</h2>
      <p>Your account <b>{username}</b> has been temporarily locked due to 5 failed login attempts.</p>
      <p>It will unlock automatically at <b>{unlock_time}</b>.</p>
      <p>If this wasn't you, please contact your administrator immediately.</p>
    </div>"""
```

### 2.11 Environment Variables

Add to `backend/.env` and `backend/.env.example`:

```env
# ── Auth ──────────────────────────────────────────────────────────────
JWT_SECRET_KEY=<generate: python -c "import secrets; print(secrets.token_hex(32))">
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_HOURS=8
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── SMTP ──────────────────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@energyiq.app
SMTP_PASSWORD=<app-specific-password>
SMTP_FROM_NAME=EnergyIQ Platform

# ── Microsoft Azure AD SSO ────────────────────────────────────────────
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_TENANT_ID=

# ── Google SSO ────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_WORKSPACE_DOMAIN=         # optional: restrict to one domain

# ── App ───────────────────────────────────────────────────────────────
FRONTEND_URL=https://energy-intelligence-platform-production-0267.up.railway.app
```

Add these fields to `app/core/config.py` `Settings`:

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

### 2.12 Password Security (`app/auth/password.py`)

```python
import re
from passlib.context import CryptContext
from pathlib import Path

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# Top-10k common passwords bundled at backend/app/auth/common_passwords.txt
_COMMON_PASSWORDS: set[str] = set()
_COMMON_PASS_FILE = Path(__file__).parent / "common_passwords.txt"
if _COMMON_PASS_FILE.exists():
    _COMMON_PASSWORDS = {line.strip().lower() for line in _COMMON_PASS_FILE.read_text().splitlines()}


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def validate_complexity(password: str) -> list[str]:
    """Returns a list of unmet rules. Empty list = password is valid."""
    errors = []
    if len(password) < 8:
        errors.append("At least 8 characters")
    if len(password) > 128:
        errors.append("Maximum 128 characters")
    if not re.search(r'[A-Z]', password):
        errors.append("At least 1 uppercase letter")
    if not re.search(r'[a-z]', password):
        errors.append("At least 1 lowercase letter")
    if not re.search(r'\d', password):
        errors.append("At least 1 number")
    if not re.search(r'[@$!%*?&]', password):
        errors.append("At least 1 special character (@$!%*?&)")
    if password.lower() in _COMMON_PASSWORDS:
        errors.append("Password is too common")
    return errors


def generate_temp_password(length: int = 16) -> str:
    import secrets, string
    alphabet = string.ascii_letters + string.digits + "@$!%*?&"
    while True:
        pwd = ''.join(secrets.choice(alphabet) for _ in range(length))
        if not validate_complexity(pwd):
            return pwd
```

---

## 3. Frontend Design

### 3.1 New File Structure

```
frontend/src/
├── auth/
│   ├── AuthContext.tsx        # React context: user state, login/logout functions
│   ├── useAuth.ts             # Hook to consume AuthContext
│   ├── ProtectedRoute.tsx     # Wraps all authenticated routes
│   └── RoleGuard.tsx          # Inline role check (hides UI elements)
├── pages/
│   ├── Login.tsx              # Landing page + login panel
│   ├── Register.tsx           # Self-registration form
│   ├── ForgotPassword.tsx     # Password reset request
│   ├── ResetPassword.tsx      # Password reset confirm (uses URL token)
│   ├── ChangePassword.tsx     # Forced first-login password change
│   ├── VerifyEmail.tsx        # Email verification landing (uses URL token)
│   └── Unauthorized.tsx       # 403 page shown on insufficient role
├── components/
│   └── auth/
│       ├── LoginForm.tsx          # Traditional credential form
│       ├── SSOButtons.tsx         # Microsoft + Google sign-in buttons
│       ├── PasswordStrength.tsx   # Strength meter (weak/medium/strong)
│       └── SessionWarning.tsx     # "Session expiring in 5 min" modal
├── hooks/
│   └── useSessionTimeout.ts   # Tracks activity, shows warning, auto-logout
└── api/
    └── auth.ts                # API functions for all auth endpoints
```

### 3.2 AuthContext Design

```typescript
// auth/AuthContext.tsx

export type UserRole =
  | 'ADMIN'
  | 'ENERGY_ENGINEER'
  | 'MAINTENANCE'
  | 'OPERATOR'
  | 'VIEWER'

export interface AuthUser {
  id: number
  username: string
  email: string | null
  full_name: string | null
  role: UserRole
  must_reset_password: boolean
  email_verified: boolean
  sso_provider: string | null
  profile_picture_url: string | null
}

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>  // re-fetch /api/auth/me (after role change etc.)
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)   // true on initial mount

  // On mount: check if session exists by calling GET /api/auth/me
  useEffect(() => {
    authApi.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (identifier: string, password: string, rememberMe: boolean) => {
    const { user } = await authApi.login({ identifier, password, remember_me: rememberMe })
    setUser(user)
  }

  const logout = async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
  }

  const refreshUser = async () => {
    const u = await authApi.me()
    setUser(u)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
```

### 3.3 Route Guard Pattern

```typescript
// auth/ProtectedRoute.tsx

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import type { UserRole } from './AuthContext'

interface Props {
  children: ReactNode
  requiredRole?: UserRole | UserRole[]
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullScreenSpinner />   // prevents flash of login page on refresh
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Force password change takes priority over everything else
  if (user!.must_reset_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  // Role check
  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    if (!allowed.includes(user!.role)) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return <>{children}</>
}
```

```typescript
// auth/RoleGuard.tsx — for hiding individual UI elements

interface Props {
  allowedRoles: UserRole[]
  children: ReactNode
  fallback?: ReactNode
}

export default function RoleGuard({ allowedRoles, children, fallback = null }: Props) {
  const { user } = useAuth()
  if (!user || !allowedRoles.includes(user.role)) return <>{fallback}</>
  return <>{children}</>
}
```

### 3.4 API Client with Cookie Support

```typescript
// api/client.ts — extend existing API base

import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  withCredentials: true,   // send httpOnly cookies on every request
})

// 401 interceptor: attempt token refresh, then redirect to login
let isRefreshing = false
let pendingRequests: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push(() => resolve(apiClient(original)))
        })
      }
      original._retry = true
      isRefreshing = true
      try {
        await apiClient.post('/auth/refresh')
        pendingRequests.forEach((cb) => cb(''))
        pendingRequests = []
        return apiClient(original)
      } catch {
        // Refresh failed — redirect to login
        window.location.href = '/login?reason=session_expired'
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  },
)
```

```typescript
// api/auth.ts

import { apiClient } from './client'
import type { AuthUser } from '../auth/AuthContext'

export const authApi = {
  login: (data: { identifier: string; password: string; remember_me: boolean }) =>
    apiClient.post<{ user: AuthUser }>('/auth/login', data).then((r) => r.data),

  register: (data: RegisterFormData) =>
    apiClient.post<{ message: string }>('/auth/register', data).then((r) => r.data),

  logout: () => apiClient.post('/auth/logout').then((r) => r.data),

  me: () => apiClient.get<AuthUser>('/auth/me').then((r) => r.data),

  refresh: () => apiClient.post('/auth/refresh').then((r) => r.data),

  verifyEmail: (token: string) =>
    apiClient.post('/auth/verify-email', { token }).then((r) => r.data),

  requestPasswordReset: (email: string) =>
    apiClient.post('/auth/password-reset-request', { email }).then((r) => r.data),

  confirmPasswordReset: (data: { token: string; new_password: string; confirm_password: string }) =>
    apiClient.post('/auth/password-reset-confirm', data).then((r) => r.data),

  changePassword: (data: { current_password: string; new_password: string; confirm_password: string }) =>
    apiClient.post('/auth/change-password', data).then((r) => r.data),

  ssoMicrosoft: () => { window.location.href = '/api/auth/sso/microsoft' },
  ssoGoogle: () => { window.location.href = '/api/auth/sso/google' },
}
```

### 3.5 Router Structure

```typescript
// App.tsx — updated structure

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Layout from './components/layout/Layout'

// Public pages
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Unauthorized from './pages/Unauthorized'

// Special auth pages (need auth but not full layout)
import ChangePassword from './pages/ChangePassword'

// Existing app pages
import EnergyOverview from './pages/EnergyOverview'
// ... etc.

// Admin pages
import AdminUsers from './pages/admin/AdminUsers'
import AdminAuditLogs from './pages/admin/AdminAuditLogs'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public routes ───────────────────────── */}
          <Route path="/login"            element={<Login />} />
          <Route path="/register"         element={<Register />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />
          <Route path="/verify-email"     element={<VerifyEmail />} />
          <Route path="/unauthorized"     element={<Unauthorized />} />

          {/* ── Force password change (auth, no Layout) */}
          <Route path="/change-password" element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          } />

          {/* ── Protected app routes ─────────────────── */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<EnergyOverview />} />
            <Route path="energy-hub"   element={<EnergyHub />} />
            <Route path="live-metrics" element={<LiveMetrics />} />
            <Route path="analytics"    element={<Analytics />} />
            <Route path="sld"          element={<SLDPage />} />
            <Route path="meter-detail/:meterId" element={<MeterDetail />} />
            <Route path="configuration" element={
              <ProtectedRoute requiredRole="ADMIN">
                <Configuration />
              </ProtectedRoute>
            } />
            <Route path="reports"      element={<Reports />} />
            <Route path="meter-health" element={<MeterHealthPage />} />
          </Route>

          {/* ── Admin routes ──────────────────────────── */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="ADMIN">
              <Layout />
            </ProtectedRoute>
          }>
            <Route path="users"      element={<AdminUsers />} />
            <Route path="audit-logs" element={<AdminAuditLogs />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

### 3.6 Landing Page Component Design

The login page is a full-screen layout with no sidebar, matching the existing dark (`surface-950`) design system.

```
<Login> (full-screen, flex, bg-surface-950)
├── Left Panel (hidden on mobile, lg:flex, ~55% width)
│   ├── EnergyIQ logo (gradient icon + wordmark)
│   ├── Tagline: "Intelligent Energy Management"
│   ├── Subtitle: "Real-time monitoring for cable manufacturing plants"
│   ├── Feature list (3–4 items with Lucide icons)
│   │   ├── ⚡ Live power & energy metrics
│   │   ├── 📊 Advanced analytics & reporting
│   │   ├── 🔔 Intelligent alert management
│   │   └── 🏭 Multi-plant hierarchy view
│   └── Industrial background (subtle, dark gradient overlay)
│
└── Right Panel (~45% width, flex items-center justify-center)
    └── Card (bg-surface-900, border-surface-800, rounded-xl, shadow-2xl, p-8, w-full max-w-[400px])
        ├── "Welcome back" h1 (text-white)
        ├── "Sign in to EnergyIQ" subtitle (text-surface-400)
        │
        ├── <LoginForm>
        │   ├── Label + Input: "Email or Username" (autocomplete="username")
        │   ├── Label + Input: "Password" + eye-toggle button (autocomplete="current-password")
        │   ├── Row: <Checkbox> "Remember me for 7 days" | <Link> "Forgot password?"
        │   ├── Error banner (conditional, red, shows INVALID_CREDENTIALS etc.)
        │   └── <Button type="submit"> "Sign In" (brand-600, w-full, loading spinner state)
        │
        ├── Divider: <hr> with "or continue with" text
        │
        ├── <SSOButtons>
        │   ├── <Button> [Microsoft SVG logo] "Sign in with Microsoft" (surface-800 bg)
        │   └── <Button> [Google SVG logo]    "Sign in with Google"    (surface-800 bg)
        │
        └── Footer: "New to EnergyIQ? " + <Link to="/register"> "Create an account"
```

**Responsive behaviour:** On mobile, the left panel is hidden. The card takes full width with px-4 padding.

**Redirect logic** in `Login.tsx`:
```typescript
const { isAuthenticated, user } = useAuth()
const location = useLocation()
const navigate = useNavigate()

// Already authenticated → go to dashboard (or the page they were trying to reach)
useEffect(() => {
  if (isAuthenticated) {
    const from = (location.state as any)?.from?.pathname ?? '/'
    navigate(user?.must_reset_password ? '/change-password' : from, { replace: true })
  }
}, [isAuthenticated])
```

### 3.7 Session Timeout Logic

```typescript
// hooks/useSessionTimeout.ts

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { authApi } from '../api/auth'

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
const WARNING_BEFORE_MS = 5 * 60 * 1000   // show warning 5min before expiry

export function useSessionTimeout() {
  const { user, logout } = useAuth()
  const [showWarning, setShowWarning] = useState(false)
  const warningTimer = useRef<ReturnType<typeof setTimeout>>()
  const logoutTimer  = useRef<ReturnType<typeof setTimeout>>()

  const clearTimers = () => {
    clearTimeout(warningTimer.current)
    clearTimeout(logoutTimer.current)
  }

  const scheduleFromToken = () => {
    // Decode exp from cookie via /api/auth/me or store exp in localStorage (non-sensitive)
    const expStr = localStorage.getItem('token_exp')
    if (!expStr) return

    const exp = parseInt(expStr, 10) * 1000    // convert Unix seconds to ms
    const now = Date.now()
    const msUntilExpiry = exp - now

    if (msUntilExpiry <= 0) {
      logout()
      return
    }

    clearTimers()

    const msUntilWarning = msUntilExpiry - WARNING_BEFORE_MS
    if (msUntilWarning > 0) {
      warningTimer.current = setTimeout(() => setShowWarning(true), msUntilWarning)
    } else {
      setShowWarning(true)
    }
    logoutTimer.current = setTimeout(() => {
      logout()
      window.location.href = '/login?reason=session_expired'
    }, msUntilExpiry)
  }

  const continueSession = async () => {
    await authApi.refresh()
    setShowWarning(false)
    scheduleFromToken()
  }

  useEffect(() => {
    if (!user) return
    scheduleFromToken()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, scheduleFromToken, { passive: true }))
    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, scheduleFromToken))
    }
  }, [user])

  return { showWarning, continueSession, logout }
}
```

`SessionWarning.tsx` is rendered at the top of `Layout.tsx`:
```typescript
const { showWarning, continueSession, logout } = useSessionTimeout()
// Modal shown when showWarning is true:
// "Your session will expire in 5 minutes. Continue working?"
// [Continue] → continueSession()   [Log out] → logout()
```

---

## 4. Security Design

### 4.1 Cookie Security

| Flag | Value | Rationale |
|------|-------|-----------|
| `httpOnly` | `true` | Prevents JS access — XSS cannot steal the token |
| `secure` | `true` | HTTPS only — Railway enforces TLS |
| `sameSite` | `strict` | Blocks cross-site requests — CSRF protection |
| `path` | `/` | Accessible to all routes including `/api` |
| `max_age` | `28800` (8h) or `604800` (7d) | Matches JWT `exp` |

### 4.2 OAuth State Parameter

- `state` is generated using `secrets.token_urlsafe(32)` — 256 bits of entropy.
- Stored in a short-lived cookie (`oauth_state`) with `httpOnly=True`, `SameSite=Lax`, `Max-Age=600`.
- `SameSite=Lax` (not `strict`) is intentional: the OAuth callback is a cross-site redirect from the identity provider, which `strict` would reject.
- The `access_token` cookie uses `SameSite=strict` because it is only ever read from same-site API calls (cookies attached automatically by the browser).

### 4.3 Password Security Implementation

- `passlib[bcrypt]` with `bcrypt__rounds=12` — ~400ms on modern hardware, acceptable UX.
- `bcrypt.verify()` is inherently constant-time — no timing attacks possible.
- Common passwords: ship `common_passwords.txt` (top-10k list from SecLists) at `backend/app/auth/common_passwords.txt`. Checked case-insensitively.
- Passwords are never logged. The `details` JSON in `auth_audit_logs` contains only masked fields.
- Unusable password sentinel for SSO users: `"!"` — bcrypt hash prefix `$2b$` never starts with `!`, so `verify("anything", "!")` always returns `False`.

### 4.4 Audit Log Implementation

```python
# Helper function called throughout auth/router.py and admin/router.py

async def log_auth_event(
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
```

**Sensitive field masking in `details`:**
- Email → `"u***@domain.com"` (only when event is `LOGIN_FAILED` with username = email)
- Password is never included, not even hashed

**Retention:** A background task (or cron via Railway cron jobs) deletes `auth_audit_logs` rows older than 90 days.

---

## 5. Integration Points

### 5.1 Protecting Existing Routes

Each existing API router currently has no auth dependency. The integration strategy is:

1. Add `from app.auth.dependencies import get_current_user` to each router file.
2. Add `_: User = Depends(get_current_user)` as the last parameter of each endpoint function.
3. No role enforcement at this stage — any valid session grants access.
4. Role enforcement will be applied per-endpoint in a follow-up task using the convenience aliases defined in §2.8.

**Files to update:**
- `app/api/routes/plants.py`
- `app/api/routes/sheds.py`
- `app/api/routes/sections.py`
- `app/api/routes/machines.py`
- `app/api/routes/meters.py`
- `app/api/routes/energy.py`
- `app/api/routes/alerts.py`
- `app/api/routes/metrics.py`
- `app/api/routes/reports.py`
- `app/api/websocket.py` (WebSocket auth uses a different pattern — see §5.2)

### 5.2 WebSocket Authentication

The existing WebSocket endpoint at `app/api/websocket.py` cannot use httpOnly cookies directly via headers in the browser's native WebSocket API. Use the cookie approach:

```python
# websocket.py
@router.websocket("/ws/energy")
async def ws_energy(websocket: WebSocket, db: Session = Depends(get_db)):
    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4001)
        return
    try:
        payload = decode_access_token(token)
        # validate session...
    except HTTPException:
        await websocket.close(code=4001)
        return
    await websocket.accept()
    # ... existing logic
```

Browsers automatically send cookies (including httpOnly) with WebSocket upgrade requests to the same origin. No frontend changes needed.

### 5.3 Existing User Model Migration

Existing seed users (from `backend/app/seed/`) will have `email_verified = false` and `must_reset_password = false` after migration (the migration sets both via `UPDATE users SET email_verified = true ...`). This prevents existing accounts from being locked out after migration.

### 5.4 Sidebar — User Menu

Add a user menu to the Sidebar footer (expanded state) and mobile top bar:

```typescript
// Replace "Simulation Active" footer section in Sidebar.tsx

const { user, logout } = useAuth()

// Expanded footer:
<div className="flex items-center gap-2.5 min-w-0">
  <UserAvatar user={user} size={28} />
  <div className="flex-1 min-w-0">
    <div className="text-xs font-medium text-surface-200 truncate">
      {user?.full_name ?? user?.username}
    </div>
    <div className="text-[9px] text-surface-500">{user?.role}</div>
  </div>
  <button onClick={logout} title="Log out" className="...">
    <LogOut size={13} />
  </button>
</div>
```

---

## Error Handling

### Standard Error Response Shape

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "details": null
}
```

For validation errors (422), FastAPI's default format is used and the frontend parses `detail` from the Pydantic `ValidationError`.

### Error Code Reference

| Code | HTTP | When |
|------|------|------|
| `INVALID_CREDENTIALS` | 401 | Wrong username/password |
| `ACCOUNT_LOCKED` | 429 | Too many failed attempts |
| `ACCOUNT_INACTIVE` | 403 | `user.active = False` |
| `EMAIL_NOT_VERIFIED` | 403 | Login before verifying email |
| `TOKEN_EXPIRED` | 401 | JWT `exp` has passed |
| `TOKEN_INVALID` | 401 | JWT signature invalid or malformed |
| `TOKEN_REVOKED` | 401 | Session revoked (logout or reset) |
| `UNAUTHORIZED` | 401 | No token provided |
| `FORBIDDEN` | 403 | Insufficient role |
| `EMAIL_ALREADY_EXISTS` | 409 | Registration with taken email |
| `USERNAME_ALREADY_EXISTS` | 409 | Registration with taken username |
| `INVALID_RESET_TOKEN` | 400 | Unknown or already-used reset token |
| `RESET_TOKEN_EXPIRED` | 400 | Reset token past 1h expiry |
| `INVALID_VERIFICATION_TOKEN` | 400 | Unknown or already-used verify token |
| `VERIFICATION_TOKEN_EXPIRED` | 400 | Verify token past 24h expiry |
| `OAUTH_STATE_MISMATCH` | 400 | OAuth CSRF check failed |
| `PASSWORD_COMPLEXITY_FAILED` | 422 | Password doesn't meet rules |

### FastAPI Exception Handler

```python
# main.py
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "ERROR", "message": str(detail), "details": None},
    )
```

---

## Testing Strategy

### 7.1 Backend Unit Tests

**Location:** `backend/tests/auth/`

| Test file | Coverage |
|-----------|----------|
| `test_jwt_handler.py` | `create_access_token`, `decode_access_token`, expired token, tampered signature |
| `test_password.py` | `hash_password`, `verify_password`, `validate_complexity` (all rules), `generate_temp_password` |
| `test_email_service.py` | Mock `aiosmtplib.send`, verify template rendering, SMTP failure handling |
| `test_oauth_client.py` | Mock HTTP calls to Azure AD / Google, state validation, user provisioning logic |

### 7.2 Backend Integration Tests

**Tool:** `pytest` + `httpx.AsyncClient` + `pytest-asyncio` + SQLite in-memory DB

```python
# tests/auth/test_login.py
async def test_login_success(client, db, test_user):
    response = await client.post("/api/auth/login", json={
        "identifier": test_user.username,
        "password": "ValidPass1!",
        "remember_me": False,
    })
    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert response.cookies["access_token"]  # not empty

async def test_login_wrong_password_increments_attempts(client, db, test_user):
    for _ in range(5):
        await client.post("/api/auth/login", json={
            "identifier": test_user.username,
            "password": "WrongPass1!",
            "remember_me": False,
        })
    response = await client.post("/api/auth/login", json={
        "identifier": test_user.username,
        "password": "WrongPass1!",
        "remember_me": False,
    })
    assert response.status_code == 429
    assert response.json()["error"] == "ACCOUNT_LOCKED"

async def test_protected_route_requires_auth(client):
    response = await client.get("/api/plants")
    assert response.status_code == 401

async def test_protected_route_with_valid_cookie(client, auth_cookie):
    response = await client.get("/api/plants", cookies={"access_token": auth_cookie})
    assert response.status_code == 200

async def test_role_enforcement(client, viewer_cookie):
    response = await client.post("/api/admin/users",
        cookies={"access_token": viewer_cookie},
        json={"username": "test", "role": "VIEWER"},
    )
    assert response.status_code == 403
```

### 7.3 Frontend Unit Tests

**Tool:** Vitest + React Testing Library

| Test file | Coverage |
|-----------|----------|
| `auth/AuthContext.test.tsx` | Initial load (me() call), login success, login error, logout |
| `auth/ProtectedRoute.test.tsx` | Redirect when unauthenticated, redirect on `must_reset_password`, role guard |
| `components/auth/LoginForm.test.tsx` | Field validation, submit calls `login()`, error banner on INVALID_CREDENTIALS |
| `components/auth/PasswordStrength.test.tsx` | Renders weak/medium/strong for various inputs |
| `pages/Register.test.tsx` | Password match validation, complexity meter, submit |
| `hooks/useSessionTimeout.test.ts` | Warning shown at T-5min, auto-logout at expiry, `continueSession` resets timer |

### 7.4 End-to-End Tests

**Tool:** Playwright

```
tests/e2e/
├── login.spec.ts         # Full login flow, cookie set, dashboard loads
├── register.spec.ts      # Registration → verify email → login
├── sso-redirect.spec.ts  # Verify redirect to Azure AD / Google (mock IdP)
├── session-timeout.spec.ts  # Advance clock, verify warning modal + logout
├── role-guard.spec.ts    # VIEWER cannot access /configuration
└── password-reset.spec.ts   # Full reset flow with email mock
```

### 7.5 Security-Specific Tests

- **No token leakage:** Assert `document.cookie` does not contain `access_token` in browser JS context.
- **CSRF simulation:** Craft a forged cross-origin POST to `/api/auth/logout` — assert it is blocked by `samesite=strict`.
- **Rate limit:** Script 11 rapid login attempts, assert 429 on the 11th.
- **SQL injection:** Pass `' OR '1'='1` as identifier — assert no user is returned.
- **Common password rejection:** Attempt to register with `"password123"` — assert `PASSWORD_COMPLEXITY_FAILED`.

---



## Correctness Properties

The following invariants must hold at all times after implementation:

Property 1: No request to any `/api/*` endpoint (except `/api/auth/*` public routes and `/health`) returns HTTP 200 without a valid, non-revoked JWT present in the `access_token` httpOnly cookie. — **Validates: Requirements 3.4, 2.5, 3.4**

Property 2: No user can access a resource that requires role R unless their stored `role` field is R or a role with higher privilege than R in the defined hierarchy. — **Validates: Requirements 3.5, 3.5, 2.5**

Property 3: No plaintext password is ever stored in the database or written to any log entry. The `hashed_password` column always contains a bcrypt hash or the unusable sentinel `"!"` for SSO-only accounts. — **Validates: Requirements 4.1, 3.3**

Property 4: A JWT whose `jti` value has a non-null `revoked_at` timestamp in the `sessions` table must never grant access, even if the JWT signature is valid and `exp` has not yet passed. — **Validates: Requirements 3.4, 2.4, 2.4**

Property 5: Every user record created via SSO callback has `email_verified=True`, `sso_provider` set to the provider name (`"microsoft"` or `"google"`), and `role=VIEWER`. — **Validates: Requirements 2.1, 2.1, 2.5, 3.1, 3.1**

Property 6: After 5 consecutive failed login attempts for the same username/email, `locked_until` is set to `now + 15 minutes` and all subsequent login attempts return HTTP 429 until that timestamp has passed. — **Validates: Requirements 3.1, 4.1**

Property 7: The `access_token` cookie is always issued with `httpOnly=True`, `secure=True`, and `samesite="strict"`. The token value is never included in any JSON response body. — **Validates: Requirements 4.1, 4.1, 3.4**

Property 8: A password reset token can only be used once — `used_at` is set on first successful use, and any subsequent use of the same token returns HTTP 400 `INVALID_RESET_TOKEN`. — **Validates: Requirements 3.3, 2.3**

## Glossary

- **JWT (JSON Web Token):** Self-contained signed token used for stateless authentication
- **OAuth 2.0:** Industry-standard protocol for delegated authorization (used by SSO)
- **OpenID Connect (OIDC):** Identity layer on top of OAuth 2.0 that provides user profile claims
- **httpOnly Cookie:** Browser cookie inaccessible to JavaScript; prevents XSS token theft
- **SameSite=Strict:** Cookie policy that blocks cross-site requests; provides CSRF protection
- **bcrypt:** Adaptive password hashing algorithm with configurable work factor
- **JTI (JWT ID):** Unique identifier embedded in JWT, used as session key for revocation
- **SSO (Single Sign-On):** Authentication mechanism allowing one login for multiple services
- **RBAC (Role-Based Access Control):** Permission model based on assigned user roles
- **CSRF (Cross-Site Request Forgery):** Attack where malicious sites trigger authenticated requests
- **State Parameter:** Random value passed through OAuth flow to prevent CSRF on the redirect
- **Refresh Token:** Long-lived credential used to obtain new access tokens without re-login
- **Unusable Password:** Sentinel value ("!") stored for SSO users to prevent password-based login
- **p95:** 95th percentile latency — 95% of requests complete within this time


### Appendix A: New Dependencies

### Backend (`backend/requirements.txt` additions)

```
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
aiosmtplib==3.0.1
authlib==1.3.1
httpx==0.27.0           # for OAuth HTTP calls inside authlib
slowapi==0.1.9
pydantic[email]==2.7.1  # already likely present; ensure email extra
```

### Frontend (`frontend/package.json` additions)

```json
{
  "dependencies": {
    "react-hook-form": "^7.51.0",
    "zod": "^3.23.0",
    "@hookform/resolvers": "^3.4.0"
  }
}
```

No new routing library needed — `react-router-dom` v6 is already present.

---

### Appendix B: Deployment Checklist

Before deploying to Railway:

- [ ] Set all env vars in Railway dashboard (JWT_SECRET_KEY, SMTP_*, AZURE_*, GOOGLE_*, FRONTEND_URL)
- [ ] Register OAuth redirect URIs in Azure AD: `{BACKEND_URL}/api/auth/sso/microsoft/callback`
- [ ] Register OAuth redirect URIs in Google Cloud Console: `{BACKEND_URL}/api/auth/sso/google/callback`
- [ ] Run `alembic upgrade head` (Railway can run this as a release command)
- [ ] Verify HTTPS is enforced (Railway provides TLS automatically)
- [ ] Confirm `SERVE_FRONTEND=false` if using separate Vite deployment, or `true` if monorepo Docker
- [ ] Set `CORS_ORIGINS` to the production frontend URL

---

**Status:** Design complete — ready for task generation  
**Next Phase:** Tasks → Implementation
