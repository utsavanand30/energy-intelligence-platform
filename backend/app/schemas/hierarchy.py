from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


# ── Plant ──────────────────────────────────────────────
class PlantBase(BaseModel):
    name: str
    location: Optional[str] = None
    description: Optional[str] = None
    active: bool = True


class PlantCreate(PlantBase):
    pass


class PlantUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None


class PlantOut(PlantBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: Optional[datetime] = None


# ── Shed ───────────────────────────────────────────────
class ShedBase(BaseModel):
    plant_id: int
    name: str
    active: bool = True


class ShedCreate(ShedBase):
    pass


class ShedUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None


class ShedOut(ShedBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: Optional[datetime] = None


# ── Section ────────────────────────────────────────────
class SectionBase(BaseModel):
    shed_id: int
    name: str
    active: bool = True


class SectionCreate(SectionBase):
    pass


class SectionUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None


class SectionOut(SectionBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: Optional[datetime] = None


# ── Machine ────────────────────────────────────────────
class MachineBase(BaseModel):
    section_id: int
    name: str
    machine_type: Optional[str] = None
    rated_power_kw: Optional[float] = None
    active: bool = True


class MachineCreate(MachineBase):
    pass


class MachineUpdate(BaseModel):
    name: Optional[str] = None
    machine_type: Optional[str] = None
    rated_power_kw: Optional[float] = None
    active: Optional[bool] = None


class MachineOut(MachineBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: Optional[datetime] = None
    # Denormalised path — useful for dropdowns
    section_name: Optional[str] = None
    shed_name: Optional[str] = None
    plant_name: Optional[str] = None
