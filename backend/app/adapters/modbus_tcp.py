"""
ModbusTCPProvider — Phase 12 placeholder.

Implements MeterDataProvider over Ethernet / Modbus TCP.
Not active in Phase 1.

When Phase 12 begins:
  - Install pymodbus: pip install pymodbus
  - Implement using pymodbus.client.ModbusTcpClient
  - Each meter has its own ip_address + port + slave_id from the DB
"""
from typing import List, Optional
from app.simulation.base_provider import MeterDataProvider, RawMeterData


class ModbusTCPProvider(MeterDataProvider):
    """Stub — not implemented in Phase 1."""

    def get_latest_reading(self, meter_id: int, meter_identification: str,
                           **kwargs) -> Optional[RawMeterData]:
        raise NotImplementedError("ModbusTCPProvider is not active in Phase 1.")

    def get_batch_readings(self, meter_ids: List[int], **kwargs) -> List[RawMeterData]:
        raise NotImplementedError("ModbusTCPProvider is not active in Phase 1.")

    def is_healthy(self) -> bool:
        return False
