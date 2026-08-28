from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from app.models.meter import CommunicationProtocol, MeterStatus


class MeterBase(BaseModel):
    identification: str
    make: Optional[str] = None
    model: Optional[str] = None
    plant_id: Optional[int] = None
    shed_id: Optional[int] = None
    section_id: Optional[int] = None
    machine_id: Optional[int] = None
    communication_protocol: CommunicationProtocol = CommunicationProtocol.SIMULATED
    slave_id: Optional[int] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    baud_rate: Optional[int] = None
    parity: Optional[str] = None
    stop_bits: Optional[float] = None
    ct_ratio: float = 1.0
    vt_ratio: float = 1.0
    enabled: bool = True


class MeterCreate(MeterBase):
    pass


class MeterUpdate(BaseModel):
    make: Optional[str] = None
    model: Optional[str] = None
    machine_id: Optional[int] = None
    section_id: Optional[int] = None
    shed_id: Optional[int] = None
    plant_id: Optional[int] = None
    communication_protocol: Optional[CommunicationProtocol] = None
    slave_id: Optional[int] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    baud_rate: Optional[int] = None
    parity: Optional[str] = None
    stop_bits: Optional[float] = None
    ct_ratio: Optional[float] = None
    vt_ratio: Optional[float] = None
    enabled: Optional[bool] = None


class MeterOut(MeterBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    communication_status: MeterStatus
    last_seen: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: Optional[datetime] = None
    # Denormalised names for display
    machine_name: Optional[str] = None
    section_name: Optional[str] = None
    shed_name: Optional[str] = None
    plant_name: Optional[str] = None


class MeterHealthOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    identification: str
    make: Optional[str] = None
    model: Optional[str] = None
    machine_name: Optional[str] = None
    section_name: Optional[str] = None
    shed_name: Optional[str] = None
    communication_protocol: CommunicationProtocol
    communication_status: MeterStatus
    last_seen: Optional[datetime] = None
    last_error: Optional[str] = None
    enabled: bool
