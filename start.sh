#!/bin/sh
# Railway startup — uvicorn starts FIRST so healthcheck passes immediately.
# Seeding runs in the background after the server is up.
set -e

PORT="${PORT:-8000}"
echo "=== Energy Intelligence Platform | PORT=$PORT ==="

# ── 0. Run DB migrations (idempotent — safe to run on every boot) ────────
echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete ✓"

# ── 1. Start uvicorn immediately in background ───────────────────────────
uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 1 --no-access-log &
UVICORN_PID=$!
echo "uvicorn started (PID=$UVICORN_PID)"

# ── 2. Wait until /health responds (max 60s) ─────────────────────────────
echo "Waiting for uvicorn to be ready..."
TRIES=0
until curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; do
    TRIES=$((TRIES+1))
    [ $TRIES -ge 30 ] && echo "uvicorn did not respond — check DATABASE_URL" && kill $UVICORN_PID && exit 1
    sleep 2
done
echo "Server ready ✓  (/health responding)"

# ── 3. Background: wait for DB, seed master data, seed history ───────────
(
    echo "[seed] Waiting for database..."
    DB_TRIES=0
    until python -c "
import os, sys
try:
    import psycopg2
    psycopg2.connect(os.environ.get('DATABASE_URL','')).close()
    sys.exit(0)
except Exception as e:
    print('DB not ready:', e); sys.exit(1)
" 2>&1; do
        DB_TRIES=$((DB_TRIES+1))
        [ $DB_TRIES -ge 20 ] && echo "[seed] DB timeout — skipping" && exit 0
        sleep 3
    done
    echo "[seed] DB ready ✓"
    python -m app.seed.run_seed 2>&1
    python -c "
import sys
from app.core.database import SessionLocal
from app.models.reading import MeterReading
from sqlalchemy import func
db = SessionLocal()
n = db.query(func.count(MeterReading.id)).scalar() or 0
db.close()
print(f'[seed] readings={n:,}')
sys.exit(0 if n >= 50000 else 1)
" 2>&1
    if [ $? -ne 0 ]; then
        echo "[seed] Generating 3-day history (~45s)..."
        python -c "
import time
from datetime import datetime, timezone, timedelta
from app.core.database import SessionLocal
from app.models.meter import EnergyMeter
from app.models.machine import Machine
from app.models.reading import MeterReading
from app.simulation.simulator import SimulatorDataProvider
db = SessionLocal()
meters = (db.query(EnergyMeter, Machine.machine_type)
    .outerjoin(Machine, EnergyMeter.machine_id == Machine.id)
    .filter(EnergyMeter.enabled == True).all())
now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
start_dt = now - timedelta(days=3)
total = 0; t0 = time.time()
for m, mt in meters:
    prov = SimulatorDataProvider()
    rows = prov.generate_historical(meter_id=m.id, meter_identification=m.identification,
        machine_type=mt or 'industrial_motor', start=start_dt, end=now, interval_seconds=30)
    batch = []
    for r in rows:
        batch.append({'timestamp':r.timestamp,'meter_id':r.meter_id,'voltage_r':r.voltage_r,
            'voltage_y':r.voltage_y,'voltage_b':r.voltage_b,'voltage_ry':r.voltage_ry,
            'voltage_yb':r.voltage_yb,'voltage_br':r.voltage_br,'current_r':r.current_r,
            'current_y':r.current_y,'current_b':r.current_b,'frequency':r.frequency,
            'active_power_kw':r.active_power_kw,'reactive_power_kvar':r.reactive_power_kvar,
            'apparent_power_kva':r.apparent_power_kva,'power_factor':r.power_factor,
            'active_energy_kwh':r.active_energy_kwh,'reactive_energy_kvarh':r.reactive_energy_kvarh,
            'apparent_energy_kvah':r.apparent_energy_kvah,'quality':r.quality,'source':r.source})
        if len(batch)>=2000:
            db.bulk_insert_mappings(MeterReading,batch); db.commit(); total+=len(batch); batch=[]
    if batch:
        db.bulk_insert_mappings(MeterReading,batch); db.commit(); total+=len(batch)
    print(f'[seed] {m.identification}')
db.close()
print(f'[seed] Done: {total:,} rows in {time.time()-t0:.0f}s')
" 2>&1
        python -m app.seed.alert_seed 2>&1
    fi
    echo "[seed] Complete ✓"
) &

# ── 4. Keep the container alive (wait for uvicorn process) ───────────────
echo "=== App live. Seed running in background. ==="
wait $UVICORN_PID
