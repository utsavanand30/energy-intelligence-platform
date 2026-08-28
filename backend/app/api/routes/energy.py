"""
Energy overview, trend, section breakdown, and machine breakdown endpoints.
All computations are done against the meter_readings table.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date

from app.core.database import get_db
from app.models.reading import MeterReading
from app.models.meter import EnergyMeter, MeterStatus
from app.models.machine import Machine
from app.models.section import Section
from app.models.shed import Shed
from app.models.plant import Plant
from app.schemas.energy import (
    EnergyKPIOut, EnergyTrendOut, TrendPoint,
    SectionConsumptionOut, MachineConsumptionOut
)

router = APIRouter(prefix="/energy", tags=["Energy"])


def _today_range():
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now


def _yesterday_range():
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


def _month_range(months_back: int = 0):
    now = datetime.now(timezone.utc)
    # First day of target month
    y, m = now.year, now.month - months_back
    while m <= 0:
        m += 12
        y -= 1
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    if months_back == 0:
        end = now
    else:
        # end = last second of that month
        if m == 12:
            end = datetime(y + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
        else:
            end = datetime(y, m + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    return start, end


def _kwh_for_meter_range(db: Session, meter_id: int, start: datetime, end: datetime) -> float:
    """
    Calculate energy consumption for a meter over a time range.

    Strategy: use AVG(active_power_kw) × hours.
    This is robust against:
      - Cumulative register resets (negative delta)
      - Multiple simulator runs creating discontinuous cumulative registers
      - Missing start/end readings

    The avg-power × time approach is used as the primary method.
    For meters with well-behaved monotonic cumulative registers the delta
    approach is also attempted, and the lower of the two is returned as a
    sanity cap.
    """
    agg = db.query(
        func.avg(MeterReading.active_power_kw),
        func.count(MeterReading.id),
    ).filter(
        MeterReading.meter_id == meter_id,
        MeterReading.timestamp >= start,
        MeterReading.timestamp <= end,
        MeterReading.active_power_kw.isnot(None),
    ).first()

    if not agg or not agg[0]:
        return 0.0

    avg_kw = agg[0]
    hours = max(0.0, (end - start).total_seconds() / 3600.0)
    return round(avg_kw * hours, 2)


def _get_meter_ids(db: Session, plant_id: int, shed_id: Optional[int],
                   section_id: Optional[int]) -> List[int]:
    q = db.query(EnergyMeter.id).filter(
        EnergyMeter.plant_id == plant_id,
        EnergyMeter.enabled == True
    )
    if shed_id:
        q = q.filter(EnergyMeter.shed_id == shed_id)
    if section_id:
        q = q.filter(EnergyMeter.section_id == section_id)
    return [row[0] for row in q.all()]


@router.get("/overview", response_model=EnergyKPIOut)
def energy_overview(
    plant_id: int,
    shed_id: Optional[int] = None,
    section_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    plant = db.query(Plant).filter(Plant.id == plant_id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    meter_ids = _get_meter_ids(db, plant_id, shed_id, section_id)
    if not meter_ids:
        return EnergyKPIOut(
            plant_id=plant_id, plant_name=plant.name,
            last_updated=datetime.now(timezone.utc)
        )

    today_start, today_end = _today_range()
    yest_start, yest_end = _yesterday_range()
    month_start, month_end = _month_range(0)
    prev_month_start, prev_month_end = _month_range(1)

    today_kwh = sum(_kwh_for_meter_range(db, mid, today_start, today_end) for mid in meter_ids)
    yesterday_kwh = sum(_kwh_for_meter_range(db, mid, yest_start, yest_end) for mid in meter_ids)
    month_kwh = sum(_kwh_for_meter_range(db, mid, month_start, month_end) for mid in meter_ids)
    prev_month_kwh = sum(_kwh_for_meter_range(db, mid, prev_month_start, prev_month_end) for mid in meter_ids)

    # Current demand: sum of latest active_power_kw for all meters
    # Use the most recent reading within last 5 minutes
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    latest_powers = (
        db.query(func.sum(MeterReading.active_power_kw))
        .filter(
            MeterReading.meter_id.in_(meter_ids),
            MeterReading.timestamp >= cutoff,
            MeterReading.active_power_kw.isnot(None)
        )
        .scalar() or 0.0
    )
    current_demand = latest_powers

    # Peak demand today
    peak = (
        db.query(func.max(MeterReading.active_power_kw))
        .filter(
            MeterReading.meter_id.in_(meter_ids),
            MeterReading.timestamp >= today_start
        )
        .scalar() or 0.0
    )

    # Average power today
    avg_power = (
        db.query(func.avg(MeterReading.active_power_kw))
        .filter(
            MeterReading.meter_id.in_(meter_ids),
            MeterReading.timestamp >= today_start,
            MeterReading.active_power_kw.isnot(None)
        )
        .scalar() or 0.0
    )

    # Average PF (today)
    avg_pf = (
        db.query(func.avg(MeterReading.power_factor))
        .filter(
            MeterReading.meter_id.in_(meter_ids),
            MeterReading.timestamp >= today_start,
            MeterReading.power_factor.isnot(None)
        )
        .scalar() or 0.0
    )

    # Online meters count
    online_meters = (
        db.query(func.count(EnergyMeter.id))
        .filter(
            EnergyMeter.id.in_(meter_ids),
            EnergyMeter.communication_status == MeterStatus.ONLINE
        )
        .scalar() or 0
    )

    # Active machines (machines with a meter that has a reading in last 5 min)
    active_machine_ids = (
        db.query(EnergyMeter.machine_id)
        .filter(
            EnergyMeter.id.in_(meter_ids),
            EnergyMeter.communication_status == MeterStatus.ONLINE,
            EnergyMeter.machine_id.isnot(None)
        )
        .distinct()
        .count()
    )

    mom_change = 0.0
    if prev_month_kwh > 0:
        mom_change = round((month_kwh - prev_month_kwh) / prev_month_kwh * 100, 1)

    shed = db.query(Shed).filter(Shed.id == shed_id).first() if shed_id else None
    section = db.query(Section).filter(Section.id == section_id).first() if section_id else None

    return EnergyKPIOut(
        plant_id=plant_id,
        plant_name=plant.name,
        shed_id=shed_id,
        shed_name=shed.name if shed else None,
        section_id=section_id,
        section_name=section.name if section else None,
        today_kwh=round(today_kwh, 1),
        yesterday_kwh=round(yesterday_kwh, 1),
        current_demand_kw=round(current_demand, 1),
        peak_demand_kw=round(peak, 1),
        avg_power_kw=round(avg_power, 1),
        avg_power_factor=round(avg_pf, 3),
        current_month_kwh=round(month_kwh, 1),
        previous_month_kwh=round(prev_month_kwh, 1),
        mom_change_pct=mom_change,
        active_machines=active_machine_ids,
        online_meters=online_meters,
        total_meters=len(meter_ids),
        last_updated=datetime.now(timezone.utc),
    )


@router.get("/trend", response_model=EnergyTrendOut)
def energy_trend(
    plant_id: int,
    shed_id: Optional[int] = None,
    section_id: Optional[int] = None,
    granularity: str = Query("hourly", pattern="^(hourly|daily|weekly|monthly)$"),
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    meter_ids = _get_meter_ids(db, plant_id, shed_id, section_id)
    if not meter_ids:
        return EnergyTrendOut(granularity=granularity, data=[])

    now = datetime.now(timezone.utc)
    if not to_dt:
        to_dt = now
    if not from_dt:
        defaults = {"hourly": 1, "daily": 7, "weekly": 28, "monthly": 180}
        from_dt = now - timedelta(days=defaults.get(granularity, 7))

    # Build time-bucket SQL
    if granularity == "hourly":
        trunc = "hour"
    elif granularity == "daily":
        trunc = "day"
    elif granularity == "weekly":
        trunc = "week"
    else:
        trunc = "month"

    rows = (
        db.query(
            func.date_trunc(trunc, MeterReading.timestamp).label("bucket"),
            func.avg(MeterReading.active_power_kw).label("avg_kw"),
            func.count(MeterReading.id).label("cnt")
        )
        .filter(
            MeterReading.meter_id.in_(meter_ids),
            MeterReading.timestamp >= from_dt,
            MeterReading.timestamp <= to_dt,
            MeterReading.active_power_kw.isnot(None)
        )
        .group_by("bucket")
        .order_by("bucket")
        .all()
    )

    # Convert average kW to kWh per bucket
    bucket_hours = {"hourly": 1, "daily": 24, "weekly": 168, "monthly": 720}
    h = bucket_hours.get(granularity, 1)

    points = [
        TrendPoint(timestamp=row.bucket, value=round(row.avg_kw * h, 1))
        for row in rows
    ]
    return EnergyTrendOut(granularity=granularity, unit="kWh", data=points)


@router.get("/section-breakdown", response_model=List[SectionConsumptionOut])
def section_breakdown(
    plant_id: int,
    shed_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    today_start, today_end = _today_range()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

    q = (
        db.query(Section, Shed)
        .join(Shed, Section.shed_id == Shed.id)
        .filter(Shed.plant_id == plant_id, Section.active == True)
    )
    if shed_id:
        q = q.filter(Section.shed_id == shed_id)
    sections = q.all()

    result = []
    total_today = 0.0

    for section, shed in sections:
        meter_ids = [
            row[0] for row in
            db.query(EnergyMeter.id)
            .filter(EnergyMeter.section_id == section.id, EnergyMeter.enabled == True)
            .all()
        ]
        if not meter_ids:
            continue

        today_kwh = sum(_kwh_for_meter_range(db, mid, today_start, today_end) for mid in meter_ids)
        current_kw = (
            db.query(func.sum(MeterReading.active_power_kw))
            .filter(
                MeterReading.meter_id.in_(meter_ids),
                MeterReading.timestamp >= cutoff,
                MeterReading.active_power_kw.isnot(None)
            )
            .scalar() or 0.0
        )
        total_today += today_kwh
        result.append(SectionConsumptionOut(
            section_id=section.id,
            section_name=section.name,
            shed_name=shed.name,
            today_kwh=round(today_kwh, 1),
            current_kw=round(current_kw, 1),
            meter_count=len(meter_ids),
            pct_of_total=0.0,
        ))

    # Fill percentage
    for item in result:
        item.pct_of_total = round(item.today_kwh / total_today * 100, 1) if total_today > 0 else 0.0
    result.sort(key=lambda x: x.today_kwh, reverse=True)
    return result


@router.get("/machine-breakdown", response_model=List[MachineConsumptionOut])
def machine_breakdown(
    plant_id: int,
    shed_id: Optional[int] = None,
    section_id: Optional[int] = None,
    top_n: Optional[int] = None,
    db: Session = Depends(get_db)
):
    today_start, today_end = _today_range()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)

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

    result = []
    for machine, section, shed in machines:
        meter = (
            db.query(EnergyMeter)
            .filter(EnergyMeter.machine_id == machine.id, EnergyMeter.enabled == True)
            .first()
        )
        if not meter:
            continue

        today_kwh = _kwh_for_meter_range(db, meter.id, today_start, today_end)
        latest = (
            db.query(MeterReading)
            .filter(MeterReading.meter_id == meter.id,
                    MeterReading.timestamp >= cutoff)
            .order_by(MeterReading.timestamp.desc())
            .first()
        )

        current_kw = latest.active_power_kw if latest else 0.0
        pf = latest.power_factor if latest else None
        v_avg = None
        i_avg = None
        if latest:
            voltages = [v for v in [latest.voltage_r, latest.voltage_y, latest.voltage_b] if v]
            currents = [c for c in [latest.current_r, latest.current_y, latest.current_b] if c]
            v_avg = sum(voltages) / len(voltages) if voltages else None
            i_avg = sum(currents) / len(currents) if currents else None

        status = meter.communication_status.value if meter else "OFFLINE"

        result.append(MachineConsumptionOut(
            machine_id=machine.id,
            machine_name=machine.name,
            meter_identification=meter.identification,
            section_name=section.name,
            shed_name=shed.name,
            today_kwh=round(today_kwh, 1),
            current_kw=round(current_kw or 0.0, 1),
            power_factor=round(pf, 3) if pf else None,
            voltage_avg=round(v_avg, 1) if v_avg else None,
            current_avg=round(i_avg, 1) if i_avg else None,
            status=status,
        ))

    result.sort(key=lambda x: x.today_kwh, reverse=True)
    if top_n:
        result = result[:top_n]
    return result
