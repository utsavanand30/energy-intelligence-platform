"""
Master data seed — Daman Unit 2 plant hierarchy.

Structure matches the reference MOS system:

Plant: Daman Unit 2
  Shed: Conductor
    Sections: Bunching, RBD, Stranding, Multiwire
  Shed: Cable
    Sections: Extruder, Armouring, Laying Up, Inner Sheathing,
              Outer Sheathing, Core Rewinding, Cable Rewinding, Curing
  Shed: Others
    Sections: Others
"""

PLANT_DATA = {
    "name": "Daman Unit 2",
    "location": "Daman, India",
    "description": "Polycab India Limited – Daman Manufacturing Unit 2",
}

HIERARCHY = {
    "Conductor": {
        "Bunching": {
            "machines": [
                {"name": "Bunching-01", "type": "Bunching Machine", "rated_kw": 350, "meter": "PIL/2/EM-49"},
                {"name": "Bunching-02", "type": "Bunching Machine", "rated_kw": 350, "meter": "PIL/2/EM-50"},
                {"name": "Bunching-03", "type": "Bunching Machine", "rated_kw": 350, "meter": "PIL/2/EM-51"},
                {"name": "Bunching-04", "type": "Bunching Machine", "rated_kw": 350, "meter": "PIL/2/EM-52"},
                {"name": "Bunching-05", "type": "Bunching Machine", "rated_kw": 350, "meter": "PIL/2/EM-53"},
                {"name": "Bunching-06", "type": "Bunching Machine", "rated_kw": 350, "meter": "PIL/2/EM-54"},
                {"name": "Bunching-07", "type": "Bunching Machine", "rated_kw": 350, "meter": "PIL/2/EM-55"},
                {"name": "Bunching-08", "type": "Bunching Machine", "rated_kw": 350, "meter": "PIL/2/EM-56"},
            ]
        },
        "RBD": {
            "machines": [
                {"name": "RBD-02",  "type": "RBD", "rated_kw": 450, "meter": "PIL/2/EM-02"},
                {"name": "RBD-05",  "type": "RBD", "rated_kw": 450, "meter": "PIL/2/EM-05"},
                {"name": "RBD-09",  "type": "RBD", "rated_kw": 450, "meter": "PIL/2/EM-09"},
                {"name": "RBD-10",  "type": "RBD", "rated_kw": 450, "meter": "PIL/2/EM-10"},
            ]
        },
        "Stranding": {
            "machines": [
                {"name": "Stranding-01", "type": "Stranding Machine", "rated_kw": 250, "meter": "PIL/2/EM-01"},
                {"name": "Stranding-05", "type": "Stranding Machine", "rated_kw": 250, "meter": "PIL/2/EM-57"},
                {"name": "Stranding-06", "type": "Stranding Machine", "rated_kw": 250, "meter": "PIL/2/EM-58"},
                {"name": "Stranding-07", "type": "Stranding Machine", "rated_kw": 250, "meter": "PIL/2/EM-59"},
                {"name": "Stranding-08", "type": "Stranding Machine", "rated_kw": 250, "meter": "PIL/2/EM-60"},
                {"name": "Stranding-09", "type": "Stranding Machine", "rated_kw": 250, "meter": "PIL/2/EM-61"},
                {"name": "Stranding-10", "type": "Stranding Machine", "rated_kw": 250, "meter": "PIL/2/EM-62"},
            ]
        },
        # MWD = Multi-Wire Drawing, displayed as "Multiwire" to match reference UI
        "Multiwire": {
            "machines": [
                {"name": "MWD-04", "type": "MWD", "rated_kw": 300, "meter": "PIL/2/EM-04"},
                {"name": "MWD-06", "type": "MWD", "rated_kw": 300, "meter": "PIL/2/EM-06"},
                {"name": "MWD-07", "type": "MWD", "rated_kw": 300, "meter": "PIL/2/EM-07"},
                {"name": "MWD-08", "type": "MWD", "rated_kw": 300, "meter": "PIL/2/EM-08"},
            ]
        },
    },
    "Cable": {
        # Extruder section = Insulation line machines
        "Extruder": {
            "machines": [
                {"name": "Extruder-01", "type": "Extruder", "rated_kw": 220, "meter": "PIL/2/EM-11"},
                {"name": "Extruder-02", "type": "Extruder", "rated_kw": 220, "meter": "PIL/2/EM-12"},
                {"name": "Extruder-03", "type": "Extruder", "rated_kw": 220, "meter": "PIL/2/EM-13"},
                {"name": "Extruder-09", "type": "Extruder", "rated_kw": 220, "meter": "PIL/2/EM-19"},
            ]
        },
        "Armouring": {
            "machines": [
                {"name": "Armouring-1", "type": "Armouring Machine", "rated_kw": 150, "meter": "PIL/2/EM-21"},
                {"name": "Armouring-2", "type": "Armouring Machine", "rated_kw": 150, "meter": "PIL/2/EM-22"},
                {"name": "Armouring-3", "type": "Armouring Machine", "rated_kw": 150, "meter": "PIL/2/EM-23"},
                {"name": "Armouring-4", "type": "Armouring Machine", "rated_kw": 150, "meter": "PIL/2/EM-24"},
                {"name": "Armouring-5", "type": "Armouring Machine", "rated_kw": 150, "meter": "PIL/2/EM-25"},
                {"name": "Armouring-7", "type": "Armouring Machine", "rated_kw": 150, "meter": "PIL/2/EM-27"},
            ]
        },
        "Laying Up": {
            "machines": [
                {"name": "Drum Twister-1", "type": "Drum Twister", "rated_kw": 180, "meter": "PIL/2/EM-31"},
                {"name": "Drum Twister-2", "type": "Drum Twister", "rated_kw": 180, "meter": "PIL/2/EM-32"},
                {"name": "Drum Twister-3", "type": "Drum Twister", "rated_kw": 180, "meter": "PIL/2/EM-33"},
                {"name": "Drum Twister-4", "type": "Drum Twister", "rated_kw": 180, "meter": "PIL/2/EM-34"},
            ]
        },
        "Inner Sheathing": {
            "machines": [
                {"name": "Extruder-04", "type": "Extruder", "rated_kw": 200, "meter": "PIL/2/EM-14"},
                {"name": "Extruder-05", "type": "Extruder", "rated_kw": 200, "meter": "PIL/2/EM-15"},
            ]
        },
        "Outer Sheathing": {
            "machines": [
                {"name": "Extruder-06", "type": "Extruder", "rated_kw": 200, "meter": "PIL/2/EM-16"},
                {"name": "Extruder-07", "type": "Extruder", "rated_kw": 200, "meter": "PIL/2/EM-17"},
                {"name": "Extruder-08", "type": "Extruder", "rated_kw": 200, "meter": "PIL/2/EM-18"},
            ]
        },
        # Sections present in reference MOS — no meters assigned yet
        "Core Rewinding": {"machines": []},
        "Cable Rewinding": {"machines": []},
        "Curing":          {"machines": []},
    },
    "Others": {
        "Others": {
            "machines": [
                {"name": "ACB / Solar Panel",     "type": "Panel Board",     "rated_kw": 100, "meter": "PIL/2/EM-41"},
                {"name": "Air Circuit Breaker",    "type": "Panel Board",     "rated_kw": 80,  "meter": "PIL/2/EM-42"},
                {"name": "Annealing Furnace",      "type": "industrial_motor","rated_kw": 120, "meter": "PIL/2/EM-43"},
                {"name": "APFC 1",                 "type": "Panel Board",     "rated_kw": 60,  "meter": "PIL/2/EM-44"},
                {"name": "APFC 2",                 "type": "Panel Board",     "rated_kw": 60,  "meter": "PIL/2/EM-45"},
                {"name": "Armouring PDB",          "type": "PDB",             "rated_kw": 80,  "meter": "PIL/2/EM-63"},
                {"name": "Conductor PDB-01",       "type": "PDB",             "rated_kw": 100, "meter": "PIL/2/EM-64"},
                {"name": "Conductor PDB-02",       "type": "PDB",             "rated_kw": 100, "meter": "PIL/2/EM-65"},
                {"name": "Conductor PDB-03",       "type": "PDB",             "rated_kw": 100, "meter": "PIL/2/EM-66"},
                {"name": "DG",                     "type": "Panel Board",     "rated_kw": 500, "meter": "PIL/2/EM-46"},
                {"name": "DT & Arm PDB",           "type": "PDB",             "rated_kw": 90,  "meter": "PIL/2/EM-67"},
                {"name": "Incommer Breaker 1 New", "type": "Panel Board",     "rated_kw": 500, "meter": "PIL/2/EM-47"},
                {"name": "Incommer Breaker 2 New", "type": "Panel Board",     "rated_kw": 500, "meter": "PIL/2/EM-48"},
                {"name": "Insulation PDB",         "type": "PDB",             "rated_kw": 90,  "meter": "PIL/2/EM-68"},
                {"name": "Outer PDB",              "type": "PDB",             "rated_kw": 90,  "meter": "PIL/2/EM-69"},
                {"name": "QC Lab / Spar",          "type": "Panel Board",     "rated_kw": 40,  "meter": "PIL/2/EM-70"},
                {"name": "Reprocessing",           "type": "Extruder",        "rated_kw": 150, "meter": "PIL/2/EM-71"},
                {"name": "Utility PDB",            "type": "PDB",             "rated_kw": 80,  "meter": "PIL/2/EM-72"},
            ]
        },
    },
}

# Meter make/model overrides — default is TRINITY TINY PRO 6
METER_MAKE_MODEL: dict = {
    "default":        {"make": "TRINITY",  "model": "TINY PRO 6"},
    "PIL/2/EM-05":    {"make": "SECURE",   "model": "ELITE100"},
    "PIL/2/EM-09":    {"make": "SECURE",   "model": "ELITE100"},
    "PIL/2/EM-10":    {"make": "SECURE",   "model": "ELITE100"},
    "PIL/2/EM-02":    {"make": "SECURE",   "model": "ELITE100"},
    "PIL/2/EM-47":    {"make": "SIEMENS",  "model": "SENTRON PAC 3200"},
    "PIL/2/EM-48":    {"make": "SIEMENS",  "model": "SENTRON PAC 3200"},
    "PIL/2/EM-46":    {"make": "SIEMENS",  "model": "SENTRON PAC 3200"},
}
