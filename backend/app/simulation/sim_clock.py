"""
Simulation clock.

Modes
-----
realtime         : wall-clock time, 1 second = 1 second
accelerated_10x  : 1 second wall-clock = 10 seconds simulated
accelerated_60x  : 1 second wall-clock = 60 seconds simulated
historical       : returns a configurable fixed start time + advances at 60x
"""
import time
from datetime import datetime, timezone
from app.core.config import settings

_MODE_SPEED = {
    "realtime": 1,
    "accelerated_10x": 10,
    "accelerated_60x": 60,
    "historical": 60,
}

_start_wall: float = time.monotonic()
_start_sim: datetime = datetime.now(timezone.utc)


def now() -> datetime:
    """Return the current simulated timestamp."""
    mode = settings.SIMULATION_MODE
    speed = _MODE_SPEED.get(mode, 1)
    elapsed_wall = time.monotonic() - _start_wall
    elapsed_sim_seconds = elapsed_wall * speed
    from datetime import timedelta
    return _start_sim + timedelta(seconds=elapsed_sim_seconds)


def reset(start: datetime | None = None) -> None:
    """Reset the simulation clock, optionally to a specific start time."""
    global _start_wall, _start_sim
    _start_wall = time.monotonic()
    _start_sim = start or datetime.now(timezone.utc)
