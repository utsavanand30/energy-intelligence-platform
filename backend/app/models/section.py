from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    shed_id = Column(Integer, ForeignKey("sheds.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    shed = relationship("Shed", back_populates="sections")
    machines = relationship("Machine", back_populates="section", cascade="all, delete-orphan")
    meters = relationship("EnergyMeter", back_populates="section")

    def __repr__(self):
        return f"<Section id={self.id} name={self.name!r} shed_id={self.shed_id}>"
