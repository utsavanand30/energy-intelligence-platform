import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


async def send_email(to: str, subject: str, html_body: str) -> None:
    """Send an HTML email via SMTP. Silently skips when SMTP_HOST is not configured."""
    if not settings.SMTP_HOST:
        # Dev mode: just log what would be sent
        print(f"[EMAIL - DEV] To: {to} | Subject: {subject}")
        return

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


# ── HTML email templates ──────────────────────────────────────────────────────

def email_verification_html(full_name: str, verify_link: str) -> str:
    name = full_name or "there"
    return f"""
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px">
<div style="max-width:520px;margin:auto;background:#1e293b;border-radius:12px;padding:32px">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
    <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#3b82f6);
                border-radius:8px;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-size:18px">⚡</span>
    </div>
    <span style="font-size:18px;font-weight:700;color:#fff">EnergyIQ</span>
  </div>
  <h2 style="color:#fff;margin:0 0 8px">Verify your email address</h2>
  <p style="color:#94a3b8">Hi {name}, thanks for signing up! Click below to verify your email. This link expires in 24 hours.</p>
  <a href="{verify_link}" style="display:inline-block;background:#3b82f6;color:#fff;
     padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
    Verify Email Address
  </a>
  <p style="color:#64748b;font-size:12px;margin-top:24px">
    If you didn't create an EnergyIQ account, you can safely ignore this email.
  </p>
</div>
</body></html>"""


def password_reset_html(reset_link: str) -> str:
    return f"""
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px">
<div style="max-width:520px;margin:auto;background:#1e293b;border-radius:12px;padding:32px">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
    <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#3b82f6);
                border-radius:8px;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-size:18px">⚡</span>
    </div>
    <span style="font-size:18px;font-weight:700;color:#fff">EnergyIQ</span>
  </div>
  <h2 style="color:#fff;margin:0 0 8px">Reset your password</h2>
  <p style="color:#94a3b8">Click below to reset your EnergyIQ password. This link expires in 1 hour and can only be used once.</p>
  <a href="{reset_link}" style="display:inline-block;background:#ef4444;color:#fff;
     padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
    Reset Password
  </a>
  <p style="color:#64748b;font-size:12px;margin-top:24px">
    If you didn't request a password reset, you can safely ignore this email.
  </p>
</div>
</body></html>"""


def welcome_admin_created_html(username: str, temp_password: str, login_url: str) -> str:
    return f"""
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px">
<div style="max-width:520px;margin:auto;background:#1e293b;border-radius:12px;padding:32px">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
    <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#3b82f6);
                border-radius:8px;display:flex;align-items:center;justify-content:center">
      <span style="color:#fff;font-size:18px">⚡</span>
    </div>
    <span style="font-size:18px;font-weight:700;color:#fff">EnergyIQ</span>
  </div>
  <h2 style="color:#fff;margin:0 0 8px">Welcome to EnergyIQ</h2>
  <p style="color:#94a3b8">Your account has been created by an administrator. Sign in using the credentials below.</p>
  <div style="background:#0f172a;border-radius:8px;padding:16px;margin:16px 0">
    <p style="margin:4px 0;color:#94a3b8"><b style="color:#e2e8f0">Username:</b> {username}</p>
    <p style="margin:4px 0;color:#94a3b8"><b style="color:#e2e8f0">Password:</b>
       <code style="background:#1e3a5f;padding:2px 6px;border-radius:4px">{temp_password}</code></p>
  </div>
  <p style="color:#f59e0b;font-size:13px">You will be required to change your password on first login.</p>
  <a href="{login_url}" style="display:inline-block;background:#3b82f6;color:#fff;
     padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
    Sign In
  </a>
</div>
</body></html>"""


def account_lockout_html(username: str, unlock_time: str) -> str:
    return f"""
<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px">
<div style="max-width:520px;margin:auto;background:#1e293b;border-radius:12px;padding:32px">
  <h2 style="color:#ef4444;margin:0 0 8px">⚠ Account Locked</h2>
  <p style="color:#94a3b8">
    Your EnergyIQ account <b style="color:#e2e8f0">{username}</b> has been temporarily locked
    due to 5 failed login attempts.
  </p>
  <p style="color:#94a3b8">It will unlock automatically at <b style="color:#e2e8f0">{unlock_time}</b>.</p>
  <p style="color:#64748b;font-size:12px;margin-top:24px">
    If this wasn't you, contact your administrator immediately.
  </p>
</div>
</body></html>"""
