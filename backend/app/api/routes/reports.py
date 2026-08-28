"""
Energy reports endpoint — returns tabular data; export handled client-side in Phase 1.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date
from pydantic import BaseModel

from app.core.database import get_db
from app.models.reading import MeterReading
from app.models.meter import EnergyMeter
from app.models.machine import Machine
from app.models.section import Section
from app.models.shed import Shed

router = APIRouter(prefix="/reports", tags=["Reports"])


class DailyMachineRow(BaseModel):
    machine_name: str
    meter_identification: str
    section_name: str
    shed_name: str
    date: date
    opening_kwh: float
    closing_kwh: float
    consumption_kwh: float
    avg_kw: float
    peak_kw: float
    avg_pf: float


@router.get("/daily", response_model=List[DailyMachineRow])
def daily_report(
    plant_id: int,
    shed_id: Optional[int] = None,
    section_id: Optional[int] = None,
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
    db: Session = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    if not to_date:
        to_date = now.date()
    if not from_date:
        from_date = to_date - timedelta(days=6)

    # Get all machines in scope
    q = (
        db.query(Machine, Section, Shed)
        .join(Section, Machine.section_id == Section.id)
        .join(Shed, Section.shed_id == Shed.id)
        .filter(Shed.plant_id == plant_id, Machine.active == True)
    )
    if shed_id:
        q = q.filter(Shed.id == shed_id)
    if section_id:
        q = q.filter(Section.id == section_id)
    machines = q.all()

    rows = []
    current_date = from_date
    while current_date <= to_date:
        day_start = datetime(current_date.year, current_date.month, current_date.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)

        for machine, section, shed in machines:
            meter = (
                db.query(EnergyMeter)
                .filter(EnergyMeter.machine_id == machine.id, EnergyMeter.enabled == True)
                .first()
            )
            if not meter:
                continue

            agg = db.query(
                func.avg(MeterReading.active_power_kw),
                func.max(MeterReading.active_power_kw),
                func.avg(MeterReading.power_factor),
                func.count(MeterReading.id),
            ).filter(
                MeterReading.meter_id == meter.id,
                MeterReading.timestamp >= day_start,
                MeterReading.timestamp < day_end,
                MeterReading.active_power_kw.isnot(None),
            ).first()

            if not agg or not agg[0]:
                continue

            avg_kw, peak_kw, avg_pf, cnt = agg
            hours = 24.0
            consumption = round((avg_kw or 0) * hours, 2)

            # Opening / closing from cumulative register (best effort — may be 0 on reset)
            opening = (
                db.query(MeterReading.active_energy_kwh)
                .filter(MeterReading.meter_id == meter.id,
                        MeterReading.timestamp >= day_start,
                        MeterReading.active_energy_kwh.isnot(None))
                .order_by(MeterReading.timestamp.asc()).limit(1).scalar()
            ) or 0.0
            closing = (
                db.query(MeterReading.active_energy_kwh)
                .filter(MeterReading.meter_id == meter.id,
                        MeterReading.timestamp < day_end,
                        MeterReading.active_energy_kwh.isnot(None))
                .order_by(MeterReading.timestamp.desc()).limit(1).scalar()
            ) or 0.0

            rows.append(DailyMachineRow(
                machine_name=machine.name,
                meter_identification=meter.identification,
                section_name=section.name,
                shed_name=shed.name,
                date=current_date,
                opening_kwh=round(opening or 0, 2),
                closing_kwh=round(closing or 0, 2),
                consumption_kwh=round(consumption, 2),
                avg_kw=round(avg_kw or 0, 1),
                peak_kw=round(peak_kw or 0, 1),
                avg_pf=round(avg_pf or 0, 3),
            ))
        current_date += timedelta(days=1)

    return rows
