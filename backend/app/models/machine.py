from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    machine_type = Column(String(100), nullable=True)   # e.g. "Bunching Machine", "Extruder"
    rated_power_kw = Column(Float, nullable=True)        # nameplate rated power
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    section = relationship("Section", back_populates="machines")
    meters = relationship("EnergyMeter", back_populates="machine")

    def __repr__(self):
        return f"<Machine id={self.id} name={self.name!r}>"
