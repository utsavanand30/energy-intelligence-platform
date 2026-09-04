# Requirements Document

**Feature:** Authentication & Landing Page  
**Feature ID:** `authentication-landing-page`  
**Status:** Finalised ✅  
**Created:** 2026-09-04  
**Last Updated:** 2026-09-04 (decisions finalised)  
**Owner:** Engineering Team  

---

## Introduction

### Purpose
Implement a secure authentication system for the Energy Intelligence Platform (EnergyIQ) that supports both traditional username/password login and enterprise Single Sign-On (SSO) integration.

### Background
- **Current State:** Platform has no authentication — users access dashboards directly
- **Problem:** No access control, security risk, cannot track user activity
- **Opportunity:** Enable enterprise SSO, role-based access, secure multi-user environment

### Goals
- Secure platform access with industry-standard authentication
- Support Microsoft Azure AD and Google Workspace SSO
- Enable self-registration and admin provisioning
- Implement role-based access control (RBAC)
- Maintain excellent UX with fast, responsive flows

### Scope
**In Scope:**
- Traditional username/password login
- Microsoft Azure AD SSO (OAuth 2.0)
- Google Workspace SSO (OAuth 2.0)
- Self-registration with email verification
- Admin user provisioning
- Password reset via email
- Session management (8hr timeout, "Remember me")
- Role-based permissions (5 roles)
- Audit logging of auth events

**Out of Scope (Deferred to Phase 2):**
- Multi-Factor Authentication (MFA/2FA)
- SAML 2.0 support
- Social logins beyond Google/Microsoft
- Password expiration policies
- IP whitelisting
- Device fingerprinting

### Stakeholders
- **Primary Users:** Plant operators, energy engineers, maintenance staff, executives
- **Technical Owner:** Engineering Team
- **Business Owner:** Product Manager
- **Security Reviewer:** InfoSec Team (Railway platform security)

---

## Requirements

### User Stories

#### US-1: Traditional Login
**As a** registered user  
**I want to** log in with username/email and password  
**So that** I can access the platform securely

**Acceptance Criteria:**
- Login form accepts username OR email in single field
- Password field with show/hide toggle
- "Remember me" checkbox (extends session to 7 days, default 8hrs)
- Invalid credentials show clear error: "Invalid username or password"
- Account lockout after 5 failed attempts (15-minute cooldown)
- Successful login → redirect to dashboard with JWT token
- Loading spinner shown during authentication

---

#### US-2: SSO Login (Microsoft Azure AD)
**As a** corporate user  
**I want to** log in using my Microsoft 365 account  
**So that** I don't need separate credentials

**Acceptance Criteria:**
- "Sign in with Microsoft" button on landing page
- Click → redirect to `login.microsoftonline.com`
- OAuth 2.0 flow handles authentication
- User auto-provisioned on first login (VIEWER role)
- Existing users matched by email (case-insensitive)
- Successful login → redirect to dashboard
- SSO errors show friendly message: "Unable to sign in. Please try again."

---

#### US-3: SSO Login (Google Workspace)
**As a** corporate user  
**I want to** log in using my Google Workspace account  
**So that** I can use my company Gmail

**Acceptance Criteria:**
- "Sign in with Google" button on landing page
- Click → redirect to `accounts.google.com`
- OAuth 2.0 flow handles authentication
- User auto-provisioned on first login (VIEWER role)
- Existing users matched by email (case-insensitive)
- Successful login → redirect to dashboard
- Profile picture imported from Google (optional)

---

#### US-4: Self-Registration
**As a** new user  
**I want to** create my own account  
**So that** I can access the platform immediately

**Acceptance Criteria:**
- "Create Account" link on landing page
- Registration form: full name, email, username, password, confirm password
- Real-time username availability check (debounced)
- Password strength meter (weak/medium/strong)
- Email uniqueness validation
- Password complexity enforced (8+ chars, uppercase, lowercase, number, special)
- Email verification sent after registration (24hr expiry)
- Account created with VIEWER role
- Can log in after clicking verification link
- Admin notified of new registration

---

#### US-5: Admin User Creation
**As an** admin  
**I want to** create user accounts manually  
**So that** I can onboard users who don't have email

**Acceptance Criteria:**
- Admin panel has "Add User" button
- Form: username, email, full name, role, optional password
- System generates secure 16-char temp password if not provided
- New user receives welcome email with credentials
- User marked with `must_reset_password = True`
- User forced to change password on first login
- Admin can set account active/inactive

---

#### US-6: Password Reset Request
**As a** user who forgot password  
**I want to** request a password reset  
**So that** I can regain access

**Acceptance Criteria:**
- "Forgot Password?" link on login page
- Form accepts email address
- Reset email sent with secure token link (1hr expiry)
- Generic success message (no user enumeration): "If account exists, you'll receive an email"
- Reset link format: `https://app.url/reset-password?token={token}`
- Token is single-use (deleted after successful reset)

---

#### US-7: Password Reset Completion
**As a** user with reset token  
**I want to** set a new password  
**So that** I can log in again

**Acceptance Criteria:**
- Reset link opens password change page
- Token validated (not expired, not used)
- Form: new password, confirm password
- Password strength meter shown
- Complexity rules enforced
- Success message: "Password changed successfully"
- Redirect to login page after 3 seconds
- All existing sessions invalidated

---

#### US-8: Force Password Change
**As a** new user with temporary password  
**I want to** be required to change my password on first login  
**So that** my account is secure

**Acceptance Criteria:**
- System detects `must_reset_password` flag
- After successful login, redirect to `/change-password` (not dashboard)
- Cannot skip (no "Later" button)
- Must enter current password + new password (2x)
- New password cannot match old password
- After change, proceed to dashboard automatically

---

#### US-9: Session Persistence
**As a** logged-in user  
**I want** my session to persist across page refreshes  
**So that** I don't need to log in repeatedly

**Acceptance Criteria:**
- JWT stored in httpOnly cookie (set by backend `Set-Cookie` response header)
- Session valid for 8 hours by default
- "Remember me" extends to 7 days
- Token validated on every API request
- Expired token → 401 response → redirect to login
- Clear message: "Your session has expired. Please log in again."

---

#### US-10: Logout
**As a** logged-in user  
**I want to** log out securely  
**So that** my account is protected on shared devices

**Acceptance Criteria:**
- Logout button in user menu dropdown (top-right)
- Click → clear token from storage
- Backend blacklists token (cannot reuse)
- Redirect to landing page
- Success message: "You have been logged out"

---

#### US-11: Session Timeout Warning
**As the** system  
**I want to** warn users before session expires  
**So that** they don't lose unsaved work

**Acceptance Criteria:**
- Modal appears 5 minutes before expiry
- Message: "Your session will expire in 5 minutes. Continue working?"
- "Continue" button → refresh token, extend session
- "Logout" button → immediate logout
- If no action, auto-logout after timeout
- Redirect to login with message: "Session expired"

---

#### US-12: Role Assignment (Admin)
**As an** admin  
**I want to** assign roles to users  
**So that** I can control access levels

**Acceptance Criteria:**
- Admin panel lists all users with current roles
- Role dropdown: VIEWER, OPERATOR, MAINTENANCE, ENERGY_ENGINEER, ADMIN
- Click → role updated immediately (next API request)
- Confirmation message shown
- Audit log records: admin_id, user_id, old_role, new_role, timestamp

---

#### US-13: SSO Auto-Provisioning
**As the** system  
**I want to** create users automatically on first SSO login  
**So that** onboarding is seamless

**Acceptance Criteria:**
- First SSO login creates user record
- Email extracted from SSO claims (required)
- Name extracted from SSO claims
- Profile picture URL saved (Google only)
- Default role: VIEWER
- Account marked as SSO-provisioned (`sso_provider` field)
- Admin email notification: "New SSO user [name] requires role approval"

---

#### US-14: Permission Enforcement (API)
**As the** system  
**I want to** enforce role-based permissions on API  
**So that** users only access authorized data

**Acceptance Criteria:**
- Every protected endpoint validates JWT
- Role checked before processing request
- Insufficient permissions → 403 Forbidden
- Error response: `{"error": "FORBIDDEN", "message": "Insufficient permissions"}`
- Audit log records unauthorized attempts

---

#### US-15: Permission Enforcement (UI)
**As the** system  
**I want to** hide unauthorized features in UI  
**So that** users see only what they can access

**Acceptance Criteria:**
- Sidebar hides admin-only routes for non-admins
- Action buttons disabled if role insufficient
- "Configuration" page accessible only to ADMIN
- "Meter Configuration" editable only by MAINTENANCE+
- Role badge shown in user menu

---

### Functional Requirements

#### FR-1: JWT Token Management
- **Algorithm:** HS256 or RS256 (configurable)
- **Access Token Lifetime:** 8 hours (configurable via env)
- **Refresh Token Lifetime:** 7 days (if "Remember me" checked)
- **Payload Structure:**
  ```json
  {
    "sub": "user_id",
    "email": "user@example.com",
    "role": "VIEWER",
    "exp": 1630000000,
    "iat": 1629970000
  }
  ```
- **Storage:** httpOnly cookie (set by backend, inaccessible to JavaScript)
- **Signing Secret:** 256-bit minimum, stored in environment variable

---

#### FR-2: Password Security
- **Hashing:** bcrypt with cost factor 12
- **Complexity Rules:**
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 number
  - At least 1 special character (@$!%*?&)
  - Maximum 128 characters
- **Common Password Check:** Block top 10,000 common passwords
- **Reset Token:** 32-byte random, URL-safe, 1-hour expiry, single-use

---

#### FR-3: Account Lockout
- **Threshold:** 5 failed login attempts
- **Cooldown:** 15 minutes
- **Tracking:** By username/email (not IP, to prevent bypass)
- **Reset:** Successful login or password reset
- **Notification:** Email sent on account lockout

---

#### FR-4: SSO Integration - Microsoft Azure AD
- **Protocol:** OAuth 2.0 / OpenID Connect
- **Authorization URL:** `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`
- **Token URL:** `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- **Scopes:** `openid`, `profile`, `email`
- **Claims Extracted:** `email`, `name`, `groups` (optional)
- **Tenant:** Configured via `AZURE_TENANT_ID` env variable
- **Client Credentials:** `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`

---

#### FR-5: SSO Integration - Google Workspace
- **Protocol:** OAuth 2.0 / OpenID Connect
- **Authorization URL:** `https://accounts.google.com/o/oauth2/v2/auth`
- **Token URL:** `https://oauth2.googleapis.com/token`
- **Scopes:** `openid`, `profile`, `email`
- **Claims Extracted:** `email`, `name`, `picture`
- **Hosted Domain Restriction:** Optional `hd` parameter for workspace-only
- **Client Credentials:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

---

#### FR-6: Email Verification
- **Token Generation:** 32-byte random, URL-safe
- **Expiry:** 24 hours
- **Storage:** Database table `email_verifications` (token, user_id, expires_at)
- **Email Subject:** "Verify your EnergyIQ account"
- **Link Format:** `https://app.url/verify-email?token={token}`
- **Resend:** Available if token expired

---

#### FR-7: Session Monitoring
- **Database Table:** `sessions`
  - `id` (primary key)
  - `user_id` (foreign key)
  - `token_jti` (JWT ID for blacklist)
  - `created_at`
  - `expires_at`
  - `last_activity`
  - `revoked_at` (nullable)
- **Activity Tracking:** Update `last_activity` on every authenticated request
- **Cleanup:** Cron job or background task deletes expired sessions daily from PostgreSQL
- **No Redis required:** PostgreSQL `sessions` table serves as session store for this phase

---

#### FR-8: Role Permissions Matrix

| Feature | VIEWER | OPERATOR | MAINTENANCE | ENERGY_ENGINEER | ADMIN |
|---------|--------|----------|-------------|-----------------|-------|
| View dashboards | ✅ | ✅ | ✅ | ✅ | ✅ |
| View reports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Export reports | ❌ | ✅ | ✅ | ✅ | ✅ |
| Acknowledge alerts | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edit meter config | ❌ | ❌ | ✅ | ✅ | ✅ |
| View audit logs | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage thresholds | ❌ | ❌ | ❌ | ✅ | ✅ |
| Advanced analytics | ❌ | ❌ | ❌ | ✅ | ✅ |
| User management | ❌ | ❌ | ❌ | ❌ | ✅ |
| System config | ❌ | ❌ | ❌ | ❌ | ✅ |

---

#### FR-9: Audit Logging
**Events to Log:**
- Successful login (user_id, ip, timestamp, method: password/sso)
- Failed login (username, ip, timestamp, reason)
- Logout (user_id, timestamp)
- Password reset request (email, ip, timestamp)
- Password reset completion (user_id, timestamp)
- Password change (user_id, timestamp)
- Email verification (user_id, timestamp)
- Role change (admin_id, target_user_id, old_role, new_role, timestamp)
- Account lockout (username, ip, timestamp)

**Storage:** `audit_logs` table, retain 90 days minimum

---

### Non-Functional Requirements

#### NFR-1: Performance
- Login response time: < 500ms (p95)
- Token validation: < 50ms (p95)
- Dashboard load after login: < 2 seconds (p95)
- SSO redirect: < 200ms (initial)
- Password reset email delivery: < 1 minute

---

#### NFR-2: Security
- **Transport:** HTTPS only (Railway provides TLS)
- **Cookie Flags:** `httpOnly`, `secure`, `sameSite=strict`
- **Rate Limiting:** 10 login attempts per IP per minute
- **CSRF Protection:** `sameSite=strict` on httpOnly cookie provides inherent CSRF protection
- **XSS Prevention:** Input sanitization, Content-Security-Policy header
- **Timing Attacks:** Constant-time password comparison

---

#### NFR-3: Scalability
- Support 500 concurrent users
- Token validation doesn't require DB lookup (JWT self-contained)
- Session store: PostgreSQL `sessions` table (Redis migration path available if scale requires)
- Horizontal scaling possible (stateless auth service)

---

#### NFR-4: Availability
- 99.5% uptime for auth service
- SSO failure doesn't break traditional login (fallback)
- Graceful error handling (no stack traces to users)
- Health check endpoint: `/api/auth/health`

---

#### NFR-5: Usability
- Login page loads < 2 seconds
- Mobile-responsive (works on phones, tablets)
- Keyboard navigation (tab order, enter to submit)
- WCAG 2.1 Level AA compliance
- Screen reader compatible (ARIA labels)
- Color contrast ratio ≥ 4.5:1

---

#### NFR-6: Compliance
- GDPR: User data export, account deletion
- Password storage: Never in plaintext or logs
- Sensitive data masked in logs (email → e***@domain.com)
- Audit trail tamper-proof (append-only)

---

### API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/login` | Traditional login | No |
| POST | `/api/auth/register` | Self-registration | No |
| POST | `/api/auth/verify-email` | Verify email token | No |
| POST | `/api/auth/logout` | Logout (blacklist token) | Yes |
| POST | `/api/auth/refresh` | Refresh access token | Yes (refresh token) |
| GET | `/api/auth/me` | Get current user info | Yes |
| POST | `/api/auth/password-reset-request` | Request password reset | No |
| POST | `/api/auth/password-reset-confirm` | Complete password reset | No |
| POST | `/api/auth/change-password` | Change password | Yes |
| GET | `/api/auth/sso/microsoft` | Initiate Microsoft OAuth | No |
| GET | `/api/auth/sso/microsoft/callback` | Microsoft OAuth callback | No |
| GET | `/api/auth/sso/google` | Initiate Google OAuth | No |
| GET | `/api/auth/sso/google/callback` | Google OAuth callback | No |
| POST | `/api/admin/users` | Create user | Yes (ADMIN) |
| GET | `/api/admin/users` | List all users | Yes (ADMIN) |
| PATCH | `/api/admin/users/{id}` | Update user role | Yes (ADMIN) |
| DELETE | `/api/admin/users/{id}` | Delete user | Yes (ADMIN) |
| GET | `/api/admin/audit-logs` | View audit logs | Yes (ADMIN) |

---

### UI Requirements

#### Landing Page
- **Layout:** Full-screen, no nav/sidebar
- **Left Half:** EnergyIQ logo, tagline, feature highlights, industrial background image
- **Right Half:** Login panel (elevated card with shadow)
- **Login Panel Sections:**
  1. Traditional login form
     - Single input: "Email or Username"
     - Password input with eye icon (show/hide)
     - "Remember me" checkbox
     - Primary "Sign In" button
     - Subtle "Forgot password?" link
  2. Divider: "Or sign in with"
  3. SSO buttons
     - "Sign in with Microsoft" (blue, Microsoft logo)
     - "Sign in with Google" (white, Google logo)
  4. Footer: "New user? Create account" link
- **Responsive:** Single column on mobile, login panel first

---

#### Registration Page
- Form fields:
  - Full Name
  - Email (with format validation)
  - Username (real-time availability check, debounced 500ms)
  - Password (with strength meter: weak/medium/strong)
  - Confirm Password
- Submit button: "Create Account"
- Back link: "Already have an account? Sign in"
- Success: "Check your email to verify your account"

---

#### Password Reset Pages
- **Request Page:**
  - Single input: Email address
  - "Send Reset Link" button
  - Generic success message
- **Confirmation Page:**
  - New Password (with strength meter)
  - Confirm New Password
  - "Reset Password" button
  - Success: "Password changed. Redirecting to login..."
  - Error states: expired token, mismatched passwords

---

#### Protected App Changes
- **User Menu (Top-Right):**
  - Avatar or initials circle
  - User's full name
  - Role badge (e.g., "Admin", "Viewer")
  - Dropdown: Profile, Settings, Logout
- **Route Guards:**
  - Unauthenticated user accessing app route → redirect `/login`
  - Authenticated user accessing `/login` → redirect `/`
  - Insufficient role → show "Access Denied" page with role requirement

---

### Database Schema Changes

#### Add to `users` table:
```sql
ALTER TABLE users ADD COLUMN must_reset_password BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN sso_provider VARCHAR(50) NULL; -- 'microsoft', 'google', or NULL
ALTER TABLE users ADD COLUMN profile_picture_url VARCHAR(500) NULL;
ALTER TABLE users ADD COLUMN failed_login_attempts INT DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP NULL;
```

#### New table: `sessions`
```sql
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_jti VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_token_jti (token_jti),
    INDEX idx_expires_at (expires_at)
);
```

#### New table: `password_reset_tokens`
```sql
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(100) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_token (token)
);
```

#### New table: `email_verifications`
```sql
CREATE TABLE email_verifications (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(100) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_token (token)
);
```

---

## Glossary

- **JWT (JSON Web Token):** Self-contained token for stateless authentication
- **OAuth 2.0:** Industry-standard authorization framework for SSO
- **OpenID Connect:** Identity layer on top of OAuth 2.0
- **httpOnly Cookie:** Cookie inaccessible to JavaScript (XSS protection)
- **CSRF (Cross-Site Request Forgery):** Attack where malicious site tricks user's browser
- **bcrypt:** Password hashing algorithm with adaptive cost factor
- **SSO (Single Sign-On):** One login for multiple applications
- **RBAC (Role-Based Access Control):** Permissions based on user role
- **WCAG:** Web Content Accessibility Guidelines
- **p95:** 95th percentile (performance metric)

---

## Dependencies

### Backend Libraries
- `PyJWT` or `python-jose` (JWT encoding/decoding)
- `passlib[bcrypt]` (password hashing)
- `authlib` (OAuth 2.0 client)
- `python-multipart` (form data parsing)
- `itsdangerous` (secure token generation)
- `pydantic[email]` (email validation)

### Frontend Libraries
- `react-router-dom` v6 (routing with guards)
- `axios` (HTTP with interceptors)
- `react-hook-form` (form handling)
- `zod` (schema validation)
- Optional: `@react-oauth/google` (Google SSO UI)

### External Services
- **Azure AD:** App registration required (client ID, secret, tenant ID)
- **Google Cloud:** OAuth 2.0 client ID required
- **Email Service:** SMTP via `aiosmtplib` or `smtplib` — configure via `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` env vars
- **Railway:** HTTPS, PostgreSQL (existing)

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SSO provider downtime | High | Medium | Keep traditional login as fallback |
| Token compromise | Critical | Low | Short lifetime, blacklist on logout, audit logs |
| Email delivery failure | Medium | Medium | Generic success message, admin reset option |
| Performance with many users | Medium | Low | Redis session store, optimize validation |
| User confusion (2 login methods) | Low | Medium | Clear UI labels, onboarding guide |
| Role misconfiguration | High | Medium | Default to VIEWER, admin approval |

---

## Success Criteria

1. ✅ Users can log in with username/password
2. ✅ Users can log in via Microsoft/Google SSO
3. ✅ Self-registration with email verification works
4. ✅ Admins can create users with temp passwords
5. ✅ Password reset flow is functional
6. ✅ Force password change on first login works
7. ✅ Sessions expire after 8 hours
8. ✅ Role permissions enforced on API and UI
9. ✅ All auth events logged to audit trail
10. ✅ Login page is mobile-responsive and accessible (WCAG AA)
11. ✅ Zero critical security vulnerabilities (penetration test)
12. ✅ Performance targets met (login < 500ms, dashboard < 2s)

---

## Decisions Log

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Email provider | **SMTP** | Free, simple, no external dependency |
| 2 | Token storage | **httpOnly cookie** | More secure — no JS access, XSS-resistant |
| 3 | Session store | **PostgreSQL** | Already available on Railway, no new service needed |
| 4 | Account deletion | **Admin-only** | Prevents accidental data loss, simpler GDPR flow |
| 5 | Azure AD group mapping | Deferred to Phase 2 | Out of scope for initial release |
| 6 | Custom login domain | Deferred to Phase 2 | Not required for MVP |

---

**Status:** Requirements finalised ✅ — All open questions resolved  
**Next Phase:** Design → Technical architecture, API specs, DB schema, security model

