from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.models.meter import EnergyMeter, MeterStatus
from app.models.machine import Machine
from app.models.section import Section
from app.models.shed import Shed
from app.models.reading import MeterReading
from app.models.user import User
from app.schemas.meter import MeterOut, MeterCreate, MeterUpdate, MeterHealthOut
from app.schemas.reading import MeterReadingOut
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/meters", tags=["Meters"])

# ── Thresholds for health status ──────────────────────────────────────
ONLINE_THRESHOLD_SEC = 120    # seen within 2 min → ONLINE
WARNING_THRESHOLD_SEC = 300   # seen within 5 min → WARNING, else OFFLINE


def _compute_status(last_seen: Optional[datetime]) -> MeterStatus:
    if last_seen is None:
        return MeterStatus.OFFLINE
    age = (datetime.now(timezone.utc) - last_seen).total_seconds()
    if age <= ONLINE_THRESHOLD_SEC:
        return MeterStatus.ONLINE
    if age <= WARNING_THRESHOLD_SEC:
        return MeterStatus.WARNING
    return MeterStatus.OFFLINE


def _enrich(m: EnergyMeter) -> MeterOut:
    out = MeterOut.model_validate(m)
    if m.machine:
        out.machine_name = m.machine.name
        if m.machine.section:
            out.section_name = m.machine.section.name
            if m.machine.section.shed:
                out.shed_name = m.machine.section.shed.name
                if m.machine.section.shed.plant:
                    out.plant_name = m.machine.section.shed.plant.name
    return out


def _meter_q(db: Session):
    return db.query(EnergyMeter).options(
        joinedload(EnergyMeter.machine)
        .joinedload(Machine.section)
        .joinedload(Section.shed)
        .joinedload(Shed.plant)
    )


@router.get("", response_model=List[MeterOut])
def list_meters(
    plant_id: Optional[int] = None,
    shed_id: Optional[int] = None,
    section_id: Optional[int] = None,
    machine_id: Optional[int] = None,
    enabled_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user)
):
    q = _meter_q(db)
    if plant_id:
        q = q.filter(EnergyMeter.plant_id == plant_id)
    if shed_id:
        q = q.filter(EnergyMeter.shed_id == shed_id)
    if section_id:
        q = q.filter(EnergyMeter.section_id == section_id)
    if machine_id:
        q = q.filter(EnergyMeter.machine_id == machine_id)
    if enabled_only:
        q = q.filter(EnergyMeter.enabled == True)
    return [_enrich(m) for m in q.order_by(EnergyMeter.identification).all()]


@router.get("/health", response_model=List[MeterHealthOut])
def meter_health(
    plant_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user)
):
    q = _meter_q(db)
    if plant_id:
        q = q.filter(EnergyMeter.plant_id == plant_id)
    meters = q.all()
    result = []
    for m in meters:
        status = _compute_status(m.last_seen) if m.enabled else MeterStatus.DISABLED
        out = MeterHealthOut(
            id=m.id,
            identification=m.identification,
            make=m.make,
            model=m.model,
            machine_name=m.machine.name if m.machine else None,
            section_name=m.machine.section.name if m.machine and m.machine.section else None,
            shed_name=(m.machine.section.shed.name
                       if m.machine and m.machine.section and m.machine.section.shed else None),
            communication_protocol=m.communication_protocol,
            communication_status=status,
            last_seen=m.last_seen,
            last_error=m.last_error,
            enabled=m.enabled,
        )
        result.append(out)
    return result


@router.get("/{meter_id}", response_model=MeterOut)
def get_meter(meter_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    m = _meter_q(db).filter(EnergyMeter.id == meter_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meter not found")
    return _enrich(m)


@router.get("/{meter_id}/latest", response_model=Optional[MeterReadingOut])
def get_latest_reading(meter_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    reading = (
        db.query(MeterReading)
        .filter(MeterReading.meter_id == meter_id)
        .order_by(MeterReading.timestamp.desc())
        .first()
    )
    return reading


@router.get("/{meter_id}/history", response_model=List[MeterReadingOut])
def get_meter_history(
    meter_id: int,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    limit: int = 2880,      # default: 1 day of 30s data
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user)
):
    q = db.query(MeterReading).filter(MeterReading.meter_id == meter_id)
    if from_dt:
        q = q.filter(MeterReading.timestamp >= from_dt)
    if to_dt:
        q = q.filter(MeterReading.timestamp <= to_dt)
    return q.order_by(MeterReading.timestamp.desc()).limit(limit).all()


@router.post("", response_model=MeterOut, status_code=201)
def create_meter(body: MeterCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    meter = EnergyMeter(**body.model_dump())
    db.add(meter)
    db.commit()
    db.refresh(meter)
    return MeterOut.model_validate(meter)


@router.patch("/{meter_id}", response_model=MeterOut)
def update_meter(meter_id: int, body: MeterUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    meter = db.query(EnergyMeter).filter(EnergyMeter.id == meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="Meter not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(meter, k, v)
    db.commit()
    db.refresh(meter)
    return MeterOut.model_validate(meter)
