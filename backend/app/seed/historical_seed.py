"""
historical_seed.py — fast 7-day backfill using bulk inserts.

Generates 30-second readings per meter for the past 7 days.
Uses per-meter SimulatorDataProvider instances so each machine
follows its own realistic load profile.

Run:
    cd backend
    venv/bin/python -m app.seed.historical_seed

Idempotent: skips meters that already have data for the target window.
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from datetime import datetime, timezone, timedelta
from app.core.database import SessionLocal
from app.models.meter import EnergyMeter
from app.models.machine import Machine
from app.models.reading import MeterReading
from app.simulation.simulator import SimulatorDataProvider

DAYS_BACK      = 7
INTERVAL_SEC   = 30
BATCH_SIZE     = 2000   # rows per INSERT — keeps memory low


def run():
    db = SessionLocal()
    try:
        meters = (
            db.query(EnergyMeter, Machine.machine_type, Machine.name)
            .outerjoin(Machine, EnergyMeter.machine_id == Machine.id)
            .filter(EnergyMeter.enabled == True)
            .all()
        )

        if not meters:
            print("No enabled meters found. Run run_seed.py first.")
            return

        # Align to the start of the current hour for a clean window
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        end_dt   = now
        start_dt = end_dt - timedelta(days=DAYS_BACK)

        # How many readings per meter
        total_intervals = int((end_dt - start_dt).total_seconds() / INTERVAL_SEC)
        print(f"Backfill window : {start_dt.date()} → {end_dt.date()}")
        print(f"Interval        : {INTERVAL_SEC}s  ({total_intervals:,} readings/meter)")
        print(f"Meters          : {len(meters)}")
        print(f"Est. total rows : {len(meters) * total_intervals:,}")
        print()

        grand_total = 0
        t0 = time.time()

        for meter_obj, machine_type, machine_name in meters:
            # Check existing coverage to avoid duplicate data
            existing_min = (
                db.query(MeterReading.timestamp)
                .filter(
                    MeterReading.meter_id == meter_obj.id,
                    MeterReading.timestamp >= start_dt,
                )
                .order_by(MeterReading.timestamp.asc())
                .limit(1)
                .scalar()
            )

            if existing_min and existing_min <= start_dt + timedelta(hours=1):
                print(f"  ↷  {meter_obj.identification:<20} already seeded — skipping")
                continue

            provider = SimulatorDataProvider()
            readings = provider.generate_historical(
                meter_id            = meter_obj.id,
                meter_identification= meter_obj.identification,
                machine_type        = machine_type or "industrial_motor",
                start               = start_dt,
                end                 = end_dt,
                interval_seconds    = INTERVAL_SEC,
            )

            batch: list[dict] = []
            meter_rows = 0
            for r in readings:
                batch.append({
                    "timestamp"            : r.timestamp,
                    "meter_id"             : r.meter_id,
                    "voltage_r"            : r.voltage_r,
                    "voltage_y"            : r.voltage_y,
                    "voltage_b"            : r.voltage_b,
                    "voltage_ry"           : r.voltage_ry,
                    "voltage_yb"           : r.voltage_yb,
                    "voltage_br"           : r.voltage_br,
                    "current_r"            : r.current_r,
                    "current_y"            : r.current_y,
                    "current_b"            : r.current_b,
                    "frequency"            : r.frequency,
                    "active_power_kw"      : r.active_power_kw,
                    "reactive_power_kvar"  : r.reactive_power_kvar,
                    "apparent_power_kva"   : r.apparent_power_kva,
                    "power_factor"         : r.power_factor,
                    "active_energy_kwh"    : r.active_energy_kwh,
                    "reactive_energy_kvarh": r.reactive_energy_kvarh,
                    "apparent_energy_kvah" : r.apparent_energy_kvah,
                    "quality"              : r.quality,
                    "source"               : r.source,
                })
                if len(batch) >= BATCH_SIZE:
                    db.bulk_insert_mappings(MeterReading, batch)
                    db.commit()
                    meter_rows += len(batch)
                    batch = []

            if batch:
                db.bulk_insert_mappings(MeterReading, batch)
                db.commit()
                meter_rows += len(batch)

            grand_total += meter_rows
            elapsed = time.time() - t0
            print(f"  ✓  {meter_obj.identification:<20} {meter_rows:>7,} rows  "
                  f"(total {grand_total:>8,} | {elapsed:.0f}s)")

        print(f"\n✅  Done. {grand_total:,} rows inserted in {time.time()-t0:.0f}s.")

    except Exception as e:
        db.rollback()
        print(f"\n❌  Error: {e}")
        import traceback; traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    run()
