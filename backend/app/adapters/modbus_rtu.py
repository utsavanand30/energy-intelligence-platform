"""
ModbusRTUProvider — Phase 12 placeholder.

Implements MeterDataProvider over RS-485 / Modbus RTU.
Not active in Phase 1. Do not call from application code yet.

When Phase 12 begins:
  - Install pymodbus: pip install pymodbus
  - Implement connect(), read_registers() using pymodbus.client.ModbusSerialClient
  - Map register values using the per-model register map defined in meter config
"""
from typing import List, Optional
from app.simulation.base_provider import MeterDataProvider, RawMeterData


class ModbusRTUProvider(MeterDataProvider):
    """Stub — not implemented in Phase 1."""

    def get_latest_reading(self, meter_id: int, meter_identification: str,
                           **kwargs) -> Optional[RawMeterData]:
        raise NotImplementedError("ModbusRTUProvider is not active in Phase 1.")

    def get_batch_readings(self, meter_ids: List[int], **kwargs) -> List[RawMeterData]:
        raise NotImplementedError("ModbusRTUProvider is not active in Phase 1.")

    def is_healthy(self) -> bool:
        return False
