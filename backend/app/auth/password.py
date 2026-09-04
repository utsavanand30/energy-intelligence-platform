import re
import secrets
import string
from pathlib import Path

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# Load common passwords list (top-10k) for complexity check
_COMMON_PASSWORDS: set[str] = set()
_COMMON_PASS_FILE = Path(__file__).parent / "common_passwords.txt"
if _COMMON_PASS_FILE.exists():
    _COMMON_PASSWORDS = {
        line.strip().lower()
        for line in _COMMON_PASS_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    if hashed == "!":
        return False
    try:
        return pwd_context.verify(plain, hashed)
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
