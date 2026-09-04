from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.models.session import Session
from app.models.user import User, UserRole
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

    # Check session is still active (not revoked, not expired)
    session = db.query(Session).filter(Session.token_jti == jti).first()
    if not session or not session.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "TOKEN_REVOKED", "message": "Session has been revoked or expired"},
        )

    # Update last_activity
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
    """Factory that returns a FastAPI dependency enforcing one of the given roles."""
    async def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "FORBIDDEN", "message": "Insufficient permissions for this action"},
            )
        return current_user
    return role_checker


# Convenience role dependency aliases
require_admin = require_role(UserRole.ADMIN)
require_energy_eng = require_role(UserRole.ADMIN, UserRole.ENERGY_ENGINEER)
require_maintenance = require_role(UserRole.ADMIN, UserRole.ENERGY_ENGINEER, UserRole.MAINTENANCE)
require_operator_plus = require_role(
    UserRole.ADMIN, UserRole.ENERGY_ENGINEER, UserRole.MAINTENANCE, UserRole.OPERATOR
)
