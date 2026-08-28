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
    """
    Application users — Phase 10 will add full auth.
    Created now so AuditLog FK is valid from the start.
    """
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

    def __repr__(self):
        return f"<User id={self.id} username={self.username!r} role={self.role}>"
