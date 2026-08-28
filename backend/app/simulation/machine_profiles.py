"""
Machine load profiles for the simulator.

Every machine type has:
  - base_load_kw       : typical running load
  - min_load_kw        : minimum (idle/no-load)
  - max_load_kw        : maximum (peak production)
  - typical_pf         : lagging power factor at base load
  - voltage_nominal    : line-to-line voltage (V)
  - operating_schedule : list of (hour, load_fraction) tuples
  - ramp_time_minutes  : how long start-up ramp takes
  - variation_pct      : random ±% applied each reading

The simulator picks a profile by machine_type name. Unknown types get
a generic "industrial_motor" profile.
"""

from typing import Dict, Any

# Schedule: list of (hour_of_day_24h, load_fraction_0_to_1)
# Interpolated linearly between points.
PROFILES: Dict[str, Dict[str, Any]] = {

    "bunching_machine": {
        "base_load_kw": 220,
        "min_load_kw": 15,
        "max_load_kw": 380,
        "typical_pf": 0.93,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 8,
        "variation_pct": 4,
        "operating_schedule": [
            (0, 0.0), (7, 0.0), (7.13, 0.3), (8, 0.65),
            (9, 0.90), (10, 0.95), (11, 0.92), (12, 0.50),
            (13, 0.0), (13.5, 0.4), (14, 0.90), (15, 0.95),
            (16, 0.92), (17, 0.70), (18, 0.40), (19, 0.10),
            (20, 0.0), (24, 0.0),
        ],
    },

    "rbd_machine": {  # Rod Break Down
        "base_load_kw": 280,
        "min_load_kw": 20,
        "max_load_kw": 450,
        "typical_pf": 0.91,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 12,
        "variation_pct": 5,
        "operating_schedule": [
            (0, 0.0), (6, 0.0), (6.2, 0.25), (7, 0.70),
            (8, 0.90), (9, 0.95), (12, 0.85), (12.5, 0.0),
            (13.5, 0.30), (14, 0.88), (15, 0.95), (17, 0.80),
            (18, 0.50), (19, 0.20), (20, 0.0), (24, 0.0),
        ],
    },

    "stranding_machine": {
        "base_load_kw": 160,
        "min_load_kw": 10,
        "max_load_kw": 260,
        "typical_pf": 0.90,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 6,
        "variation_pct": 4,
        "operating_schedule": [
            (0, 0.0), (7, 0.0), (7.1, 0.30), (8, 0.75),
            (9, 0.90), (12, 0.80), (12.5, 0.0),
            (13.5, 0.35), (14, 0.88), (17, 0.65),
            (18, 0.30), (19, 0.0), (24, 0.0),
        ],
    },

    "mwd_machine": {  # Multi-Wire Drawing
        "base_load_kw": 190,
        "min_load_kw": 15,
        "max_load_kw": 310,
        "typical_pf": 0.92,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 8,
        "variation_pct": 4,
        "operating_schedule": [
            (0, 0.0), (7, 0.0), (7.15, 0.28), (8, 0.72),
            (9, 0.92), (11, 0.90), (12, 0.45), (13, 0.0),
            (13.5, 0.38), (14, 0.88), (16, 0.90), (17, 0.60),
            (18, 0.25), (19, 0.0), (24, 0.0),
        ],
    },

    "extruder": {
        "base_load_kw": 140,
        "min_load_kw": 30,
        "max_load_kw": 220,
        "typical_pf": 0.89,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 15,
        "variation_pct": 6,
        "operating_schedule": [
            (0, 0.0), (7, 0.0), (7.25, 0.40), (8, 0.70),
            (9, 0.88), (12, 0.82), (12.5, 0.50),
            (13, 0.50), (13.5, 0.55), (14, 0.85), (17, 0.75),
            (18, 0.40), (19, 0.10), (20, 0.0), (24, 0.0),
        ],
    },

    "drum_twister": {
        "base_load_kw": 110,
        "min_load_kw": 8,
        "max_load_kw": 180,
        "typical_pf": 0.88,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 5,
        "variation_pct": 5,
        "operating_schedule": [
            (0, 0.0), (7, 0.0), (7.08, 0.25), (8, 0.72),
            (9, 0.88), (12, 0.78), (12.5, 0.0),
            (13.5, 0.30), (14, 0.85), (17, 0.60),
            (18, 0.20), (19, 0.0), (24, 0.0),
        ],
    },

    "armouring_machine": {
        "base_load_kw": 95,
        "min_load_kw": 8,
        "max_load_kw": 155,
        "typical_pf": 0.87,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 5,
        "variation_pct": 5,
        "operating_schedule": [
            (0, 0.0), (7, 0.0), (7.1, 0.20), (8, 0.68),
            (9, 0.85), (12, 0.75), (12.5, 0.0),
            (13.5, 0.28), (14, 0.82), (17, 0.55),
            (18, 0.15), (19, 0.0), (24, 0.0),
        ],
    },

    "panel_board": {  # PDB / distribution boards
        "base_load_kw": 45,
        "min_load_kw": 10,
        "max_load_kw": 80,
        "typical_pf": 0.85,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 0,
        "variation_pct": 8,
        "operating_schedule": [
            (0, 0.40), (6, 0.40), (7, 0.55), (8, 0.80),
            (9, 0.90), (12, 0.85), (13, 0.75), (14, 0.88),
            (17, 0.78), (18, 0.60), (20, 0.45), (24, 0.40),
        ],
    },

    "compressor": {
        "base_load_kw": 55,
        "min_load_kw": 5,
        "max_load_kw": 85,
        "typical_pf": 0.86,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 2,
        "variation_pct": 10,
        "operating_schedule": [
            (0, 0.30), (6, 0.30), (7, 0.70), (8, 0.85),
            (9, 0.90), (12, 0.80), (13, 0.75),
            (14, 0.88), (17, 0.75), (18, 0.55),
            (20, 0.35), (24, 0.30),
        ],
    },

    # Fallback for any unrecognised machine type
    "industrial_motor": {
        "base_load_kw": 80,
        "min_load_kw": 5,
        "max_load_kw": 130,
        "typical_pf": 0.88,
        "voltage_nominal": 415,
        "frequency_nominal": 50.0,
        "ramp_time_minutes": 5,
        "variation_pct": 6,
        "operating_schedule": [
            (0, 0.0), (7, 0.0), (7.1, 0.30), (8, 0.70),
            (9, 0.90), (12, 0.75), (12.5, 0.0),
            (13.5, 0.35), (14, 0.85), (17, 0.65),
            (18, 0.25), (19, 0.0), (24, 0.0),
        ],
    },
}


# Maps machine_type strings (from DB) → profile key
MACHINE_TYPE_MAP: Dict[str, str] = {
    "Bunching Machine": "bunching_machine",
    "Bunching": "bunching_machine",
    "RBD": "rbd_machine",
    "Rod Break Down": "rbd_machine",
    "Stranding Machine": "stranding_machine",
    "Stranding": "stranding_machine",
    "MWD": "mwd_machine",
    "Multi Wire Drawing": "mwd_machine",
    "Extruder": "extruder",
    "Insulation": "extruder",
    "Sheathing": "extruder",
    "Drum Twister": "drum_twister",
    "Laying Up": "drum_twister",
    "Armouring": "armouring_machine",
    "Armouring Machine": "armouring_machine",
    "PDB": "panel_board",
    "Panel Board": "panel_board",
    "Distribution Board": "panel_board",
    "Compressor": "compressor",
    "Air Compressor": "compressor",
}


def get_profile(machine_type: str) -> Dict[str, Any]:
    """Return the simulator profile for a given machine_type string."""
    key = MACHINE_TYPE_MAP.get(machine_type, "industrial_motor")
    return PROFILES[key]
