from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Shed(Base):
    __tablename__ = "sheds"

    id = Column(Integer, primary_key=True, index=True)
    plant_id = Column(Integer, ForeignKey("plants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    plant = relationship("Plant", back_populates="sheds")
    sections = relationship("Section", back_populates="shed", cascade="all, delete-orphan")
    meters = relationship("EnergyMeter", back_populates="shed")

    def __repr__(self):
        return f"<Shed id={self.id} name={self.name!r} plant_id={self.plant_id}>"
