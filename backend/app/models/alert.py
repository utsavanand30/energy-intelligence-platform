from sqlalchemy import (
    Column, Integer, String, Boolean, ForeignKey,
    DateTime, Float, Enum as SAEnum, Text
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class AlertSeverity(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AlertType(str, enum.Enum):
    LOW_POWER_FACTOR = "LOW_POWER_FACTOR"
    HIGH_CURRENT = "HIGH_CURRENT"
    HIGH_VOLTAGE = "HIGH_VOLTAGE"
    LOW_VOLTAGE = "LOW_VOLTAGE"
    VOLTAGE_IMBALANCE = "VOLTAGE_IMBALANCE"
    CURRENT_IMBALANCE = "CURRENT_IMBALANCE"
    HIGH_DEMAND = "HIGH_DEMAND"
    SUDDEN_LOAD_INCREASE = "SUDDEN_LOAD_INCREASE"
    ABNORMAL_ENERGY = "ABNORMAL_ENERGY"
    SCHEDULE_VIOLATION = "SCHEDULE_VIOLATION"
    METER_COMM_FAILURE = "METER_COMM_FAILURE"
    MISSING_DATA = "MISSING_DATA"


class AlertStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


class AlertRule(Base):
    """Configurable alert thresholds per meter or section."""
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    alert_type = Column(SAEnum(AlertType), nullable=False)
    severity = Column(SAEnum(AlertSeverity), default=AlertSeverity.WARNING, nullable=False)

    # Scope — all nullable; if null, rule applies globally
    plant_id = Column(Integer, ForeignKey("plants.id"), nullable=True)
    shed_id = Column(Integer, ForeignKey("sheds.id"), nullable=True)
    section_id = Column(Integer, ForeignKey("sections.id"), nullable=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    meter_id = Column(Integer, ForeignKey("energy_meters.id"), nullable=True)

    # Threshold values
    threshold_value = Column(Float, nullable=True)
    threshold_min = Column(Float, nullable=True)
    threshold_max = Column(Float, nullable=True)

    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Alert(Base):
    """Fired alert instances."""
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("alert_rules.id"), nullable=True)
    meter_id = Column(Integer, ForeignKey("energy_meters.id"), nullable=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True, index=True)

    alert_type = Column(SAEnum(AlertType), nullable=False, index=True)
    severity = Column(SAEnum(AlertSeverity), nullable=False, index=True)
    status = Column(SAEnum(AlertStatus), default=AlertStatus.ACTIVE, nullable=False, index=True)

    message = Column(Text, nullable=False)
    value = Column(Float, nullable=True)      # The value that triggered the alert
    threshold = Column(Float, nullable=True)  # The threshold that was breached

    fired_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by = Column(String(100), nullable=True)

    def __repr__(self):
        return f"<Alert id={self.id} type={self.alert_type} severity={self.severity}>"
