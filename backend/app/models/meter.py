from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey,
    DateTime, Float, Enum as SAEnum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class CommunicationProtocol(str, enum.Enum):
    MODBUS_RTU = "MODBUS_RTU"
    MODBUS_TCP = "MODBUS_TCP"
    SIMULATED = "SIMULATED"


class MeterStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    WARNING = "WARNING"
    OFFLINE = "OFFLINE"
    DISABLED = "DISABLED"


class EnergyMeter(Base):
    __tablename__ = "energy_meters"

    id = Column(Integer, primary_key=True, index=True)

    # Identification
    identification = Column(String(100), nullable=False, unique=True, index=True)
    make = Column(String(100), nullable=True)    # e.g. TRINITY, SECURE, SIEMENS
    model = Column(String(100), nullable=True)   # e.g. TINY PRO 6, ELITE100

    # Hierarchy foreign keys — all optional to allow meters not yet assigned
    plant_id = Column(Integer, ForeignKey("plants.id"), nullable=True, index=True)
    shed_id = Column(Integer, ForeignKey("sheds.id"), nullable=True, index=True)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True, index=True)

    # Communication
    communication_protocol = Column(
        SAEnum(CommunicationProtocol),
        default=CommunicationProtocol.SIMULATED,
        nullable=False
    )
    slave_id = Column(Integer, nullable=True)        # Modbus slave/unit ID
    ip_address = Column(String(45), nullable=True)   # For Modbus TCP
    port = Column(Integer, nullable=True)            # TCP port
    baud_rate = Column(Integer, nullable=True)       # RTU baud rate
    parity = Column(String(5), nullable=True)        # N / E / O
    stop_bits = Column(Float, nullable=True)         # 1, 1.5, 2

    # Instrument transformers
    ct_ratio = Column(Float, default=1.0)            # e.g. 200/5 = 40
    vt_ratio = Column(Float, default=1.0)

    # Operational
    enabled = Column(Boolean, default=True, nullable=False)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    communication_status = Column(
        SAEnum(MeterStatus),
        default=MeterStatus.OFFLINE,
        nullable=False
    )
    last_error = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    plant = relationship("Plant", back_populates="meters")
    shed = relationship("Shed", back_populates="meters")
    section = relationship("Section", back_populates="meters")
    machine = relationship("Machine", back_populates="meters")
    readings = relationship("MeterReading", back_populates="meter",
                            cascade="all, delete-orphan",
                            order_by="MeterReading.timestamp.desc()")

    def __repr__(self):
        return f"<EnergyMeter id={self.id} identification={self.identification!r}>"
