from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class EnergyKPIOut(BaseModel):
    """Plant/shed/section level KPI summary."""
    plant_id: int
    plant_name: str
    shed_id: Optional[int] = None
    shed_name: Optional[str] = None
    section_id: Optional[int] = None
    section_name: Optional[str] = None

    today_kwh: float = 0.0
    yesterday_kwh: float = 0.0
    current_demand_kw: float = 0.0
    peak_demand_kw: float = 0.0
    avg_power_kw: float = 0.0
    avg_power_factor: float = 0.0
    current_month_kwh: float = 0.0
    previous_month_kwh: float = 0.0
    mom_change_pct: float = 0.0

    active_machines: int = 0
    online_meters: int = 0
    total_meters: int = 0

    last_updated: Optional[datetime] = None


class TrendPoint(BaseModel):
    timestamp: datetime
    value: float
    label: Optional[str] = None


class EnergyTrendOut(BaseModel):
    granularity: str          # hourly | daily | weekly | monthly
    unit: str = "kWh"
    data: List[TrendPoint] = []


class SectionConsumptionOut(BaseModel):
    section_id: int
    section_name: str
    shed_name: str
    today_kwh: float
    current_kw: float
    meter_count: int
    pct_of_total: float = 0.0


class MachineConsumptionOut(BaseModel):
    machine_id: int
    machine_name: str
    meter_identification: Optional[str] = None
    section_name: str
    shed_name: str
    today_kwh: float
    current_kw: float
    power_factor: Optional[float] = None
    voltage_avg: Optional[float] = None
    current_avg: Optional[float] = None
    status: str = "ONLINE"       # ONLINE | WARNING | OFFLINE | IDLE


class AlertOut(BaseModel):
    id: int
    alert_type: str
    severity: str
    status: str
    message: str
    machine_name: Optional[str] = None
    meter_identification: Optional[str] = None
    value: Optional[float] = None
    threshold: Optional[float] = None
    fired_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
