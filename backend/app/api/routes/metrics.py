"""
Live metrics endpoint — detailed per-meter electrical analysis.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.models.reading import MeterReading
from app.models.meter import EnergyMeter
from app.models.user import User
from app.schemas.reading import MeterReadingOut
from app.auth.dependencies import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/metrics", tags=["Metrics"])


class MetricsSummary(BaseModel):
    total_kwh: float = 0.0
    avg_power_kw: float = 0.0
    avg_pf: float = 0.0
    max_demand_kw: float = 0.0
    avg_voltage: float = 0.0
    avg_current: float = 0.0
    reading_count: int = 0


@router.get("/summary", response_model=MetricsSummary)
def metrics_summary(
    meter_id: Optional[int] = None,
    machine_id: Optional[int] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    if not from_dt:
        from_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if not to_dt:
        to_dt = now

    # Resolve meter IDs
    if meter_id:
        mids = [meter_id]
    elif machine_id:
        mids = [
            row[0] for row in
            db.query(EnergyMeter.id)
            .filter(EnergyMeter.machine_id == machine_id, EnergyMeter.enabled == True)
            .all()
        ]
    else:
        return MetricsSummary()

    if not mids:
        return MetricsSummary()

    row = (
        db.query(
            func.count(MeterReading.id),
            func.avg(MeterReading.active_power_kw),
            func.max(MeterReading.active_power_kw),
            func.avg(MeterReading.power_factor),
            func.avg(
                (MeterReading.voltage_r + MeterReading.voltage_y + MeterReading.voltage_b) / 3
            ),
            func.avg(
                (MeterReading.current_r + MeterReading.current_y + MeterReading.current_b) / 3
            ),
        )
        .filter(
            MeterReading.meter_id.in_(mids),
            MeterReading.timestamp >= from_dt,
            MeterReading.timestamp <= to_dt,
        )
        .first()
    )

    if not row or row[0] == 0:
        return MetricsSummary()

    cnt, avg_kw, max_kw, avg_pf, avg_v, avg_i = row

    # Energy: avg_kw × hours
    hours = (to_dt - from_dt).total_seconds() / 3600
    total_kwh = (avg_kw or 0) * hours

    return MetricsSummary(
        total_kwh=round(total_kwh, 1),
        avg_power_kw=round(avg_kw or 0, 1),
        avg_pf=round(avg_pf or 0, 3),
        max_demand_kw=round(max_kw or 0, 1),
        avg_voltage=round(avg_v or 0, 1),
        avg_current=round(avg_i or 0, 1),
        reading_count=cnt or 0,
    )


@router.get("/readings", response_model=List[MeterReadingOut])
def get_readings(
    meter_id: Optional[int] = None,
    machine_id: Optional[int] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    granularity: str = Query("raw", pattern="^(raw|1min|5min|15min|30min|hourly)$"),
    limit: int = 1440,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    if not from_dt:
        from_dt = now - timedelta(hours=24)
    if not to_dt:
        to_dt = now

    if meter_id:
        mids = [meter_id]
    elif machine_id:
        mids = [
            row[0] for row in
            db.query(EnergyMeter.id)
            .filter(EnergyMeter.machine_id == machine_id, EnergyMeter.enabled == True)
            .all()
        ]
    else:
        return []

    q = (
        db.query(MeterReading)
        .filter(
            MeterReading.meter_id.in_(mids),
            MeterReading.timestamp >= from_dt,
            MeterReading.timestamp <= to_dt,
        )
        .order_by(MeterReading.timestamp.asc())
        .limit(limit)
    )
    return q.all()
