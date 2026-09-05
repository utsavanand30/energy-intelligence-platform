import re
import secrets
import string
from pathlib import Path

import bcrypt as _bcrypt

# Load common passwords list
_COMMON_PASSWORDS: set[str] = set()
_COMMON_PASS_FILE = Path(__file__).parent / "common_passwords.txt"
if _COMMON_PASS_FILE.exists():
    _COMMON_PASSWORDS = {
        line.strip().lower()
        for line in _COMMON_PASS_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }

BCRYPT_ROUNDS = 12


def hash_password(plain: str) -> str:
    """Hash a password using raw bcrypt (bypasses passlib compatibility issues)."""
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt(BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against a bcrypt hash."""
    if not hashed or hashed == "!":
        return False
    try:
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def validate_complexity(password: str) -> list[str]:
    """Returns list of unmet rules. Empty list means password is valid."""
    errors: list[str] = []
    if len(password) < 8:
        errors.append("At least 8 characters required")
    if len(password) > 128:
        errors.append("Maximum 128 characters allowed")
    if not re.search(r"[A-Z]", password):
        errors.append("At least 1 uppercase letter required")
    if not re.search(r"[a-z]", password):
        errors.append("At least 1 lowercase letter required")
    if not re.search(r"\d", password):
        errors.append("At least 1 number required")
    if not re.search(r"[@$!%*?&]", password):
        errors.append("At least 1 special character required (@$!%*?&)")
    if password.lower() in _COMMON_PASSWORDS:
        errors.append("Password is too common — choose a more unique password")
    return errors


def generate_temp_password(length: int = 16) -> str:
    """Generate a random password that always passes validate_complexity."""
    alphabet = string.ascii_letters + string.digits + "@$!%*?&"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if not validate_complexity(pwd):
            return pwd
