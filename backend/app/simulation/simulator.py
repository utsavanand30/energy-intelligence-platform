"""
SimulatorDataProvider — generates realistic industrial energy data.

Key design decisions
--------------------
* Each meter's state is maintained across calls so that cumulative energy
  (kWh register) grows continuously and realistically.
* Load follows an operating schedule (hour-of-day) with linear interpolation.
* Random variation is added per reading within ±variation_pct.
* Occasional anomalies are injected (low PF, voltage sag, comm failure).
* Phase imbalance is simulated by small per-phase offsets.
"""

import random
import math
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from app.simulation.base_provider import MeterDataProvider, RawMeterData
from app.simulation.machine_profiles import get_profile
from app.simulation import sim_clock


# ── Anomaly probabilities per reading ─────────────────────────────────
P_COMM_FAILURE = 0.003      # 0.3 % chance of simulated comm failure
P_LOW_PF_EVENT = 0.01       # 1 % chance of low-PF episode
P_VOLTAGE_SAG = 0.008       # 0.8 % chance of voltage sag
P_LOAD_SPIKE = 0.005        # 0.5 % sudden load spike


class MeterState:
    """Per-meter mutable state tracked across readings."""
    def __init__(self, meter_id: int, meter_identification: str,
                 machine_type: str, phase_offset: float = 0.0):
        self.meter_id = meter_id
        self.meter_identification = meter_identification
        self.profile = get_profile(machine_type)
        self.phase_offset = phase_offset          # small per-phase voltage offset (V)
        self.cumulative_kwh: float = random.uniform(50_000, 500_000)
        self.cumulative_kvarh: float = self.cumulative_kwh * 0.35
        self.cumulative_kvah: float = self.cumulative_kwh * 1.08
        self.comm_failure_until: Optional[datetime] = None
        self.low_pf_until: Optional[datetime] = None

    def is_comm_failed(self, ts: datetime) -> bool:
        if self.comm_failure_until and ts < self.comm_failure_until:
            return True
        return False

    def is_low_pf(self, ts: datetime) -> bool:
        if self.low_pf_until and ts < self.low_pf_until:
            return True
        return False


def _interpolate_schedule(schedule: List[tuple], hour_frac: float) -> float:
    """
    Linear interpolation of load fraction from schedule points.
    schedule is a list of (hour, fraction) tuples, sorted by hour.
    """
    for i in range(len(schedule) - 1):
        h0, f0 = schedule[i]
        h1, f1 = schedule[i + 1]
        if h0 <= hour_frac < h1:
            t = (hour_frac - h0) / (h1 - h0)
            return f0 + t * (f1 - f0)
    return 0.0


class SimulatorDataProvider(MeterDataProvider):

    def __init__(self):
        # meter_id → MeterState, populated lazily on first read
        self._states: Dict[int, MeterState] = {}

    def _ensure_state(self, meter_id: int, meter_identification: str,
                      machine_type: str = "industrial_motor") -> MeterState:
        if meter_id not in self._states:
            offset = random.uniform(-3.0, 3.0)
            self._states[meter_id] = MeterState(
                meter_id, meter_identification, machine_type, offset
            )
        return self._states[meter_id]

    def get_latest_reading(self, meter_id: int, meter_identification: str,
                           machine_type: str = "industrial_motor",
                           **kwargs) -> Optional[RawMeterData]:
        state = self._ensure_state(meter_id, meter_identification, machine_type)
        ts = sim_clock.now()
        return self._generate_reading(state, ts)

    def get_batch_readings(self, meter_ids: List[int],
                           meter_meta: Dict[int, Dict] = None,
                           **kwargs) -> List[RawMeterData]:
        results = []
        ts = sim_clock.now()
        for mid in meter_ids:
            meta = (meter_meta or {}).get(mid, {})
            identification = meta.get("identification", f"METER-{mid}")
            machine_type = meta.get("machine_type", "industrial_motor")
            state = self._ensure_state(mid, identification, machine_type)
            reading = self._generate_reading(state, ts)
            if reading:
                results.append(reading)
        return results

    def is_healthy(self) -> bool:
        return True

    # ── Core reading generation ──────────────────────────────────────

    def _generate_reading(self, state: MeterState, ts: datetime) -> Optional[RawMeterData]:
        """Generate one realistic reading for a meter at timestamp ts."""

        # --- Occasional comm failure ---
        if random.random() < P_COMM_FAILURE and not state.is_comm_failed(ts):
            duration = random.uniform(30, 300)  # 30s – 5 min failure window
            state.comm_failure_until = ts + timedelta(seconds=duration)

        if state.is_comm_failed(ts):
            return None   # No data — callers treat None as missing reading

        prof = state.profile
        var = prof["variation_pct"] / 100.0

        # --- Load fraction from schedule ---
        hour_frac = ts.hour + ts.minute / 60.0 + ts.second / 3600.0
        load_frac = _interpolate_schedule(prof["operating_schedule"], hour_frac)

        # --- Occasional load spike ---
        if random.random() < P_LOAD_SPIKE:
            load_frac = min(1.0, load_frac * random.uniform(1.15, 1.35))

        # --- Active power ---
        base_kw = prof["min_load_kw"] + load_frac * (prof["max_load_kw"] - prof["min_load_kw"])
        noise = random.gauss(0, base_kw * var * 0.5)
        active_kw = max(prof["min_load_kw"] * 0.5, base_kw + noise)

        # --- Power factor ---
        if state.is_low_pf(ts):
            pf = random.uniform(0.70, 0.82)
        elif random.random() < P_LOW_PF_EVENT:
            duration = random.uniform(60, 600)
            state.low_pf_until = ts + timedelta(seconds=duration)
            pf = random.uniform(0.70, 0.82)
        else:
            pf_base = prof["typical_pf"]
            pf = min(0.999, max(0.70, pf_base + random.gauss(0, 0.015)))

        # --- Derived power values ---
        apparent_kva = active_kw / pf if pf > 0 else 0
        reactive_kvar = math.sqrt(max(0, apparent_kva ** 2 - active_kw ** 2))
        reactive_kvar *= random.uniform(0.97, 1.03)  # tiny noise

        # --- Voltage ---
        v_nom = prof["voltage_nominal"]
        if random.random() < P_VOLTAGE_SAG:
            v_nom *= random.uniform(0.88, 0.95)

        # Three-phase line-to-line voltages with small imbalance
        vr = v_nom / math.sqrt(3) + state.phase_offset + random.gauss(0, 1.2)
        vy = v_nom / math.sqrt(3) + random.gauss(0, 1.2)
        vb = v_nom / math.sqrt(3) + random.gauss(0, 1.2)

        vry = v_nom + random.gauss(0, 1.5)
        vyb = v_nom + random.gauss(0, 1.5)
        vbr = v_nom + random.gauss(0, 1.5)

        # --- Current (from P = √3 × VL × IL × PF) ---
        il = active_kw * 1000 / (math.sqrt(3) * v_nom * pf) if v_nom > 0 and pf > 0 else 0
        ir = il * random.uniform(0.97, 1.03)
        iy = il * random.uniform(0.97, 1.03)
        ib = il * random.uniform(0.97, 1.03)

        # --- Frequency ---
        freq_nom = prof["frequency_nominal"]
        freq = freq_nom + random.gauss(0, 0.04)

        # --- Cumulative energy update ---
        # dt_hours: assume 30-second intervals (can vary slightly)
        dt_h = 30 / 3600.0
        delta_kwh = active_kw * dt_h
        delta_kvarh = reactive_kvar * dt_h
        delta_kvah = apparent_kva * dt_h

        state.cumulative_kwh += delta_kwh
        state.cumulative_kvarh += delta_kvarh
        state.cumulative_kvah += delta_kvah

        return RawMeterData(
            meter_id=state.meter_id,
            meter_identification=state.meter_identification,
            timestamp=ts,
            voltage_r=round(vr, 2),
            voltage_y=round(vy, 2),
            voltage_b=round(vb, 2),
            voltage_ry=round(vry, 2),
            voltage_yb=round(vyb, 2),
            voltage_br=round(vbr, 2),
            current_r=round(ir, 2),
            current_y=round(iy, 2),
            current_b=round(ib, 2),
            frequency=round(freq, 3),
            active_power_kw=round(active_kw, 2),
            reactive_power_kvar=round(reactive_kvar, 2),
            apparent_power_kva=round(apparent_kva, 2),
            power_factor=round(pf, 4),
            active_energy_kwh=round(state.cumulative_kwh, 3),
            reactive_energy_kvarh=round(state.cumulative_kvarh, 3),
            apparent_energy_kvah=round(state.cumulative_kvah, 3),
            quality=0,
            source="simulated",
        )

    # ── Historical generation (used by seed script) ──────────────────

    def generate_historical(
        self,
        meter_id: int,
        meter_identification: str,
        machine_type: str,
        start: datetime,
        end: datetime,
        interval_seconds: int = 30,
    ) -> List[RawMeterData]:
        """
        Generate a full historical dataset between start and end.
        Used once by the seed script to pre-populate the database.
        """
        state = MeterState(meter_id, meter_identification, machine_type,
                           phase_offset=random.uniform(-3.0, 3.0))
        results = []
        current = start
        while current <= end:
            reading = self._generate_reading(state, current)
            if reading:
                results.append(reading)
            current += timedelta(seconds=interval_seconds)
        return results


# Module-level singleton — import this everywhere
simulator = SimulatorDataProvider()
