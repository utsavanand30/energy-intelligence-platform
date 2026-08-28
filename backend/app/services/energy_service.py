"""
Background service that:
1. Polls the SimulatorDataProvider every 30 seconds.
2. Persists new readings to the database.
3. Updates meter communication_status and last_seen.
4. Broadcasts the latest readings to all connected WebSocket clients.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Set, Any
import json

from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.meter import EnergyMeter, MeterStatus
from app.models.machine import Machine
from app.models.reading import MeterReading
from app.simulation.simulator import simulator
from app.core.config import settings

logger = logging.getLogger(__name__)

# ── WebSocket connection registry ─────────────────────────────────────
# Maps client_id → WebSocket object
_connections: Dict[str, Any] = {}


def register_ws(client_id: str, ws) -> None:
    _connections[client_id] = ws
    logger.info(f"WS client connected: {client_id} (total={len(_connections)})")


def unregister_ws(client_id: str) -> None:
    _connections.pop(client_id, None)
    logger.info(f"WS client disconnected: {client_id} (total={len(_connections)})")


async def _broadcast(payload: dict) -> None:
    dead = []
    for cid, ws in list(_connections.items()):
        try:
            await ws.send_text(json.dumps(payload, default=str))
        except Exception:
            dead.append(cid)
    for cid in dead:
        _connections.pop(cid, None)


# ── Polling loop ──────────────────────────────────────────────────────

def _get_meter_meta(db: Session) -> Dict[int, Dict]:
    """Fetch all enabled meters with their machine type for the simulator."""
    rows = (
        db.query(EnergyMeter, Machine.machine_type)
        .outerjoin(Machine, EnergyMeter.machine_id == Machine.id)
        .filter(EnergyMeter.enabled == True)
        .all()
    )
    result = {}
    for meter, mt in rows:
        result[meter.id] = {
            "identification": meter.identification,
            "machine_type": mt or "industrial_motor",
            "machine_name": meter.machine.name if meter.machine else None,
            "section_name": (meter.machine.section.name
                             if meter.machine and meter.machine.section else None),
        }
    return result


async def polling_loop() -> None:
    """
    Runs forever as an asyncio task.
    Every SCAN_INTERVAL_SECONDS, reads all meters via the simulator,
    persists to DB, updates meter status, and broadcasts over WebSocket.
    """
    interval = settings.SCAN_INTERVAL_SECONDS
    logger.info(f"Energy polling loop started — interval={interval}s")

    while True:
        await asyncio.sleep(interval)
        try:
            db: Session = SessionLocal()
            try:
                meter_meta = _get_meter_meta(db)
                if not meter_meta:
                    continue

                meter_ids = list(meter_meta.keys())
                readings = simulator.get_batch_readings(meter_ids, meter_meta=meter_meta)

                batch = []
                broadcast_batch = []
                seen_ids = {r.meter_id for r in readings}

                for raw in readings:
                    batch.append({
                        "timestamp": raw.timestamp,
                        "meter_id": raw.meter_id,
                        "voltage_r": raw.voltage_r,
                        "voltage_y": raw.voltage_y,
                        "voltage_b": raw.voltage_b,
                        "voltage_ry": raw.voltage_ry,
                        "voltage_yb": raw.voltage_yb,
                        "voltage_br": raw.voltage_br,
                        "current_r": raw.current_r,
                        "current_y": raw.current_y,
                        "current_b": raw.current_b,
                        "frequency": raw.frequency,
                        "active_power_kw": raw.active_power_kw,
                        "reactive_power_kvar": raw.reactive_power_kvar,
                        "apparent_power_kva": raw.apparent_power_kva,
                        "power_factor": raw.power_factor,
                        "active_energy_kwh": raw.active_energy_kwh,
                        "reactive_energy_kvarh": raw.reactive_energy_kvarh,
                        "apparent_energy_kvah": raw.apparent_energy_kvah,
                        "quality": raw.quality,
                        "source": raw.source,
                    })

                    meta = meter_meta[raw.meter_id]
                    voltages = [v for v in [raw.voltage_r, raw.voltage_y, raw.voltage_b] if v]
                    currents = [c for c in [raw.current_r, raw.current_y, raw.current_b] if c]

                    broadcast_batch.append({
                        "type": "meter_reading",
                        "meter_id": raw.meter_id,
                        "meter_identification": raw.meter_identification,
                        "machine_name": meta.get("machine_name"),
                        "section_name": meta.get("section_name"),
                        "timestamp": raw.timestamp.isoformat(),
                        "active_power_kw": raw.active_power_kw,
                        "reactive_power_kvar": raw.reactive_power_kvar,
                        "apparent_power_kva": raw.apparent_power_kva,
                        "power_factor": raw.power_factor,
                        "voltage_r": raw.voltage_r,
                        "voltage_y": raw.voltage_y,
                        "voltage_b": raw.voltage_b,
                        "voltage_avg": round(sum(voltages) / len(voltages), 2) if voltages else None,
                        "current_r": raw.current_r,
                        "current_y": raw.current_y,
                        "current_b": raw.current_b,
                        "current_avg": round(sum(currents) / len(currents), 2) if currents else None,
                        "frequency": raw.frequency,
                        "active_energy_kwh": raw.active_energy_kwh,
                        "communication_status": "ONLINE",
                    })

                # Bulk insert readings
                if batch:
                    db.bulk_insert_mappings(MeterReading, batch)

                # Update meter status
                now = datetime.now(timezone.utc)
                db.query(EnergyMeter).filter(EnergyMeter.id.in_(list(seen_ids))).update(
                    {"last_seen": now, "communication_status": MeterStatus.ONLINE},
                    synchronize_session=False
                )
                # Mark meters with no reading as OFFLINE
                failed_ids = set(meter_ids) - seen_ids
                if failed_ids:
                    db.query(EnergyMeter).filter(EnergyMeter.id.in_(list(failed_ids))).update(
                        {"communication_status": MeterStatus.OFFLINE},
                        synchronize_session=False
                    )

                db.commit()

                # Broadcast to WebSocket clients
                if broadcast_batch and _connections:
                    await _broadcast({
                        "type": "batch_update",
                        "count": len(broadcast_batch),
                        "readings": broadcast_batch,
                    })

            finally:
                db.close()

        except Exception as exc:
            logger.error(f"Polling loop error: {exc}", exc_info=True)
