import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Request, status
from jose import JWTError, jwt

from app.core.config import settings


def create_access_token(
    user_id: int,
    email: str,
    role: str,
    remember_me: bool = False,
) -> tuple[str, str, datetime]:
    """Returns (encoded_token, jti, expires_at)."""
    jti = str(uuid.uuid4())
    if remember_me:
        expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    else:
        expires_delta = timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
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
    """Decode and validate a JWT. Raises HTTPException 401 on failure."""
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "TOKEN_INVALID", "message": "Invalid or expired token"},
        )


def set_auth_cookie(response, token: str, remember_me: bool = False) -> None:
    max_age = 60 * 60 * 24 * settings.REFRESH_TOKEN_EXPIRE_DAYS if remember_me else 60 * 60 * settings.ACCESS_TOKEN_EXPIRE_HOURS
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
