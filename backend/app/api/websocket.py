"""
WebSocket endpoint.

Clients connect to /ws/realtime and receive JSON messages every 30 seconds
containing the latest readings for all enabled meters.

Message format:
{
  "type": "batch_update",
  "count": 65,
  "readings": [
    {
      "type": "meter_reading",
      "meter_id": 1,
      "meter_identification": "PIL/2/EM-49",
      "machine_name": "Bunching-01",
      "section_name": "Bunching",
      "timestamp": "...",
      "active_power_kw": 246.16,
      "voltage_avg": 239.4,
      "current_avg": 363.2,
      "frequency": 50.05,
      "power_factor": 0.96,
      ...
    }
  ]
}

A client can also send { "type": "ping" } and receive { "type": "pong" }.
"""
import uuid
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.energy_service import register_ws, unregister_ws

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/realtime")
async def websocket_realtime(websocket: WebSocket):
    await websocket.accept()
    client_id = str(uuid.uuid4())
    register_ws(client_id, websocket)

    # Send a welcome message immediately
    await websocket.send_text(json.dumps({
        "type": "connected",
        "client_id": client_id,
        "message": "Connected to Energy Intelligence Platform real-time feed.",
    }))

    try:
        while True:
            # Keep the connection alive; handle ping from client
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected normally.")
    except Exception as e:
        logger.warning(f"WebSocket error for {client_id}: {e}")
    finally:
        unregister_ws(client_id)
