"""
MeterDataProvider — abstract interface.

All data sources (simulator, Modbus RTU, Modbus TCP, MQTT) must implement
this interface. The rest of the application only depends on this contract,
never on a specific implementation.
"""
from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class RawMeterData:
    """
    Normalised meter reading returned by any provider.
    Field names match the MeterReading database columns 1-to-1 so
    the persistence layer needs no mapping logic.
    """
    meter_id: int
    meter_identification: str
    timestamp: datetime

    voltage_r: Optional[float] = None
    voltage_y: Optional[float] = None
    voltage_b: Optional[float] = None
    voltage_ry: Optional[float] = None
    voltage_yb: Optional[float] = None
    voltage_br: Optional[float] = None

    current_r: Optional[float] = None
    current_y: Optional[float] = None
    current_b: Optional[float] = None

    frequency: Optional[float] = None
    active_power_kw: Optional[float] = None
    reactive_power_kvar: Optional[float] = None
    apparent_power_kva: Optional[float] = None
    power_factor: Optional[float] = None

    active_energy_kwh: Optional[float] = None
    reactive_energy_kvarh: Optional[float] = None
    apparent_energy_kvah: Optional[float] = None

    # 0=good, 1=interpolated, 2=estimated, 3=bad
    quality: int = 0
    source: str = "unknown"


class MeterDataProvider(ABC):
    """
    Abstract base class for all meter data sources.

    To add a new data source (e.g. Modbus TCP):
      1. Subclass MeterDataProvider
      2. Implement get_latest_reading() and get_batch_readings()
      3. Register the subclass in main.py
    """

    @abstractmethod
    def get_latest_reading(self, meter_id: int, meter_identification: str,
                           **kwargs) -> Optional[RawMeterData]:
        """Return the most recent reading for a single meter."""
        ...

    @abstractmethod
    def get_batch_readings(self, meter_ids: List[int],
                           **kwargs) -> List[RawMeterData]:
        """Return the most recent reading for a list of meters in one call."""
        ...

    @abstractmethod
    def is_healthy(self) -> bool:
        """Return True if the data source is reachable and functioning."""
        ...
