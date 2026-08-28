#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Production startup — runs inside the Docker container on Koyeb / Render.
#
# Steps:
#   1. Wait for the database to accept connections (retry up to 30×)
#   2. Seed master data (idempotent — safe on every restart)
#   3. Seed historical readings if the DB is fresh (< 50 k rows)
#   4. Seed alert rules
#   5. Start uvicorn on $PORT (injected by Koyeb/Render, default 8000)
# ─────────────────────────────────────────────────────────────────────────────
set -e

PORT="${PORT:-8000}"

echo "════════════════════════════════════════════════"
echo " Energy Intelligence Platform — startup"
echo " PORT = $PORT"
echo "════════════════════════════════════════════════"

# ── Step 1: wait for DB ────────────────────────────────────────────────────
echo ""
echo "▶ Waiting for database…"
MAX=30
WAITED=0
until python -c "
import os, sys
try:
    import psycopg2
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.close()
    sys.exit(0)
except Exception as e:
    print(f'  DB not ready: {e}')
    sys.exit(1)
" 2>&1; do
    WAITED=$((WAITED + 1))
    if [ $WAITED -ge $MAX ]; then
        echo "ERROR: database did not become ready after ${MAX} attempts — aborting."
        exit 1
    fi
    sleep 2
done
echo "  Database ready ✓"

# ── Step 2: master data seed (idempotent) ─────────────────────────────────
echo ""
echo "▶ Seeding master data…"
python -m app.seed.run_seed

# ── Step 3: historical readings if fresh DB ───────────────────────────────
echo ""
echo "▶ Checking historical data…"
python - <<'PYEOF'
import sys
from app.core.database import SessionLocal
from app.models.reading import MeterReading
from sqlalchemy import func

db = SessionLocal()
count = db.query(func.count(MeterReading.id)).scalar() or 0
db.close()
print(f"  Existing readings: {count:,}")
sys.exit(0 if count >= 50000 else 1)
PYEOF
NEED_SEED=$?

if [ $NEED_SEED -ne 0 ]; then
    echo "  Fresh database detected — seeding 3 days of history (~45 s)…"
    python - <<'PYEOF'
import sys, time
from datetime import datetime, timezone, timedelta
from app.core.database import SessionLocal
from app.models.meter import EnergyMeter
from app.models.machine import Machine
from app.models.reading import MeterReading
from app.simulation.simulator import SimulatorDataProvider

db = SessionLocal()
meters = (
    db.query(EnergyMeter, Machine.machine_type)
    .outerjoin(Machine, EnergyMeter.machine_id == Machine.id)
    .filter(EnergyMeter.enabled == True)
    .all()
)
now      = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
end_dt   = now
start_dt = end_dt - timedelta(days=3)
BATCH    = 2000
total    = 0
t0       = time.time()

for meter_obj, machine_type in meters:
    prov = SimulatorDataProvider()
    rows = prov.generate_historical(
        meter_id             = meter_obj.id,
        meter_identification = meter_obj.identification,
        machine_type         = machine_type or "industrial_motor",
        start                = start_dt,
        end                  = end_dt,
        interval_seconds     = 30,
    )
    batch = []
    for r in rows:
        batch.append({
            "timestamp": r.timestamp, "meter_id": r.meter_id,
            "voltage_r": r.voltage_r, "voltage_y": r.voltage_y, "voltage_b": r.voltage_b,
            "voltage_ry": r.voltage_ry, "voltage_yb": r.voltage_yb, "voltage_br": r.voltage_br,
            "current_r": r.current_r, "current_y": r.current_y, "current_b": r.current_b,
            "frequency": r.frequency,
            "active_power_kw": r.active_power_kw,
            "reactive_power_kvar": r.reactive_power_kvar,
            "apparent_power_kva": r.apparent_power_kva,
            "power_factor": r.power_factor,
            "active_energy_kwh": r.active_energy_kwh,
            "reactive_energy_kvarh": r.reactive_energy_kvarh,
            "apparent_energy_kvah": r.apparent_energy_kvah,
            "quality": r.quality, "source": r.source,
        })
        if len(batch) >= BATCH:
            db.bulk_insert_mappings(MeterReading, batch)
            db.commit()
            total += len(batch)
            batch = []
    if batch:
        db.bulk_insert_mappings(MeterReading, batch)
        db.commit()
        total += len(batch)
    print(f"  ✓ {meter_obj.identification}")

db.close()
print(f"  Seeded {total:,} rows in {time.time()-t0:.0f}s")
PYEOF

    echo ""
    echo "▶ Seeding alert rules…"
    python -m app.seed.alert_seed
fi

# ── Step 5: start server ──────────────────────────────────────────────────
echo ""
echo "▶ Starting uvicorn on port ${PORT}…"
echo "════════════════════════════════════════════════"
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers 1 \
    --no-access-log
