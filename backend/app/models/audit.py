from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class AuditLog(Base):
    """Records all significant configuration changes for accountability."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Who
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(100), nullable=True)

    # What
    action = Column(String(100), nullable=False)     # e.g. "METER_ASSIGNED"
    entity_type = Column(String(50), nullable=True)  # e.g. "EnergyMeter"
    entity_id = Column(Integer, nullable=True)
    entity_name = Column(String(200), nullable=True)

    # Details
    details = Column(Text, nullable=True)            # JSON string of old/new values
    ip_address = Column(String(45), nullable=True)

    def __repr__(self):
        return f"<AuditLog id={self.id} action={self.action!r}>"
