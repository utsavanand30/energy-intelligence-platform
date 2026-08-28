from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class MeterReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    timestamp: datetime
    meter_id: int

    voltage_r: Optional[float] = None
    voltage_y: Optional[float] = None
    voltage_b: Optional[float] = None
    voltage_ry: Optional[float] = None
    voltage_yb: Optional[float] = None
    voltage_br: Optional[float] = None

    current_r: Optional[float] = None
    current_y: Optional[float] = None
    current_b: Optional[float] = None

    frequency: Optional[float] = None
    active_power_kw: Optional[float] = None
    reactive_power_kvar: Optional[float] = None
    apparent_power_kva: Optional[float] = None
    power_factor: Optional[float] = None

    active_energy_kwh: Optional[float] = None
    reactive_energy_kvarh: Optional[float] = None
    apparent_energy_kvah: Optional[float] = None

    quality: int = 0
    source: str = "simulated"


class RealtimeReading(BaseModel):
    """Normalised real-time payload pushed over WebSocket."""
    meter_id: int
    meter_identification: str
    machine_name: Optional[str] = None
    section_name: Optional[str] = None
    timestamp: datetime

    active_power_kw: Optional[float] = None
    reactive_power_kvar: Optional[float] = None
    apparent_power_kva: Optional[float] = None
    power_factor: Optional[float] = None

    voltage_r: Optional[float] = None
    voltage_y: Optional[float] = None
    voltage_b: Optional[float] = None
    voltage_avg: Optional[float] = None

    current_r: Optional[float] = None
    current_y: Optional[float] = None
    current_b: Optional[float] = None
    current_avg: Optional[float] = None

    frequency: Optional[float] = None
    active_energy_kwh: Optional[float] = None

    communication_status: str = "ONLINE"
