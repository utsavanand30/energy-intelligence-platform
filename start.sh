#!/bin/sh
# Production startup script for Render.
# 1. Run master data seed (idempotent — safe every restart)
# 2. Check if historical data exists; if not, run a 3-day seed so
#    the dashboard shows data immediately on first boot.
# 3. Start uvicorn

set -e

echo "=== Energy Intelligence Platform — starting up ==="
echo "DATABASE_URL prefix: ${DATABASE_URL%%@*}@..."

echo ""
echo "--- Step 1: Seeding master data ---"
python -m app.seed.run_seed

echo ""
echo "--- Step 2: Checking historical data ---"
python - <<'PYEOF'
import sys
from app.core.database import SessionLocal
from app.models.reading import MeterReading
from sqlalchemy import func

db = SessionLocal()
count = db.query(func.count(MeterReading.id)).scalar() or 0
db.close()

print(f"Existing readings: {count:,}")
if count < 50000:
    print("Less than 50k readings found — running 3-day historical seed...")
    sys.exit(1)   # signal to shell to run seed
else:
    print("Historical data present — skipping seed.")
    sys.exit(0)
PYEOF

SEED_NEEDED=$?
if [ $SEED_NEEDED -ne 0 ]; then
    echo "--- Running 3-day historical seed (this takes ~45s) ---"
    # Override DAYS_BACK inline via env for faster first boot
    python - <<'PYEOF'
import sys, os
sys.path.insert(0, '.')
# Temporarily use 3 days to keep first-boot fast on Render free tier
from datetime import datetime, timezone, timedelta
from app.core.database import SessionLocal
from app.models.meter import EnergyMeter
from app.models.machine import Machine
from app.models.reading import MeterReading
from app.simulation.simulator import SimulatorDataProvider
import time

db = SessionLocal()
meters = (
    db.query(EnergyMeter, Machine.machine_type)
    .outerjoin(Machine, EnergyMeter.machine_id == Machine.id)
    .filter(EnergyMeter.enabled == True)
    .all()
)
now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
end_dt   = now
start_dt = end_dt - timedelta(days=3)
BATCH    = 2000
total    = 0
t0       = time.time()

for meter_obj, machine_type in meters:
    prov = SimulatorDataProvider()
    rows = prov.generate_historical(
        meter_id=meter_obj.id,
        meter_identification=meter_obj.identification,
        machine_type=machine_type or "industrial_motor",
        start=start_dt, end=end_dt, interval_seconds=30,
    )
    batch = []
    for r in rows:
        batch.append({
            "timestamp": r.timestamp, "meter_id": r.meter_id,
            "voltage_r": r.voltage_r, "voltage_y": r.voltage_y, "voltage_b": r.voltage_b,
            "voltage_ry": r.voltage_ry, "voltage_yb": r.voltage_yb, "voltage_br": r.voltage_br,
            "current_r": r.current_r, "current_y": r.current_y, "current_b": r.current_b,
            "frequency": r.frequency,
            "active_power_kw": r.active_power_kw, "reactive_power_kvar": r.reactive_power_kvar,
            "apparent_power_kva": r.apparent_power_kva, "power_factor": r.power_factor,
            "active_energy_kwh": r.active_energy_kwh, "reactive_energy_kvarh": r.reactive_energy_kvarh,
            "apparent_energy_kvah": r.apparent_energy_kvah,
            "quality": r.quality, "source": r.source,
        })
        if len(batch) >= BATCH:
            db.bulk_insert_mappings(MeterReading, batch)
            db.commit(); total += len(batch); batch = []
    if batch:
        db.bulk_insert_mappings(MeterReading, batch)
        db.commit(); total += len(batch)
    print(f"  {meter_obj.identification}")

db.close()
print(f"Seed done: {total:,} rows in {time.time()-t0:.0f}s")
PYEOF

    echo "--- Seeding alert rules ---"
    python -m app.seed.alert_seed
fi

echo ""
echo "--- Step 3: Starting uvicorn on port 8000 ---"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
