from sqlalchemy import (
    Column, Integer, Float, ForeignKey, DateTime,
    String, Index, SmallInteger
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class MeterReading(Base):
    """
    Raw 30-second meter readings.

    TimescaleDB note:
        After enabling TimescaleDB, convert this table to a hypertable:
        SELECT create_hypertable('meter_readings', 'timestamp');
        The composite index on (meter_id, timestamp) will then become a
        per-chunk local index, giving excellent time-range query performance.
    """
    __tablename__ = "meter_readings"

    # Primary key
    id = Column(Integer, primary_key=True, index=True)

    # Time and source
    timestamp = Column(DateTime(timezone=True), nullable=False, index=True)
    meter_id = Column(Integer, ForeignKey("energy_meters.id", ondelete="CASCADE"),
                      nullable=False, index=True)

    # Line voltages (V)
    voltage_r = Column(Float, nullable=True)   # R-phase to neutral
    voltage_y = Column(Float, nullable=True)   # Y-phase to neutral
    voltage_b = Column(Float, nullable=True)   # B-phase to neutral
    voltage_ry = Column(Float, nullable=True)  # R-Y line voltage
    voltage_yb = Column(Float, nullable=True)  # Y-B line voltage
    voltage_br = Column(Float, nullable=True)  # B-R line voltage

    # Phase currents (A)
    current_r = Column(Float, nullable=True)
    current_y = Column(Float, nullable=True)
    current_b = Column(Float, nullable=True)

    # Frequency (Hz)
    frequency = Column(Float, nullable=True)

    # Power
    active_power_kw = Column(Float, nullable=True)     # kW  (total three-phase)
    reactive_power_kvar = Column(Float, nullable=True)  # kVAr
    apparent_power_kva = Column(Float, nullable=True)   # kVA

    # Power factor (-1 to 1, negative = leading)
    power_factor = Column(Float, nullable=True)

    # Cumulative energy registers — use delta for consumption calculation
    active_energy_kwh = Column(Float, nullable=True)    # cumulative kWh
    reactive_energy_kvarh = Column(Float, nullable=True)
    apparent_energy_kvah = Column(Float, nullable=True)

    # Data quality flag: 0=good, 1=interpolated, 2=estimated, 3=bad/missing
    quality = Column(SmallInteger, default=0, nullable=False)

    # Optional: source tag for tracing simulator vs real reads
    source = Column(String(20), default="simulated", nullable=False)

    # Relationships
    meter = relationship("EnergyMeter", back_populates="readings")

    # Composite index for the most common query pattern: meter + time range
    __table_args__ = (
        Index("ix_meter_readings_meter_ts", "meter_id", "timestamp"),
    )

    def __repr__(self):
        return (
            f"<MeterReading meter_id={self.meter_id} "
            f"ts={self.timestamp} kW={self.active_power_kw}>"
        )
