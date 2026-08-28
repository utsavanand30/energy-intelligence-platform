"""
fix_hierarchy.py — corrects the plant hierarchy based on the reference MOS screenshots.

Changes:
1. Rename Section "MWD" → "Multiwire" in Conductor shed
2. Move RBD-02 (PIL/2/EM-02) from Others → Conductor → RBD section
3. Move Annealing Furnace (PIL/2/EM-43) from Others → Conductor → Others-Utilities
   (actually keep it in Others - it's a utility, not a conductor process)
4. Rename Cable sections to match reference:
   - "Insulation" stays as is (Extruder-01/02/03/09)
   - "Inner Sheathing" → keep (Extruder-04/05)
   - "Outer Sheathing" → keep (Extruder-06/07/08)
   - Add missing Cable sections from reference: Core Rewinding, Cable Rewinding, Curing
     (these have no meters yet — add placeholder entries)
5. Fix all meter.shed_id, meter.section_id to match their machine's hierarchy
   (many meters have shed/section = Others even though machine is in Conductor/Cable)

Usage:
    cd backend
    venv/bin/python -m app.seed.fix_hierarchy
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.database import SessionLocal
from app.models import Plant, Shed, Section, Machine, EnergyMeter

def run():
    db = SessionLocal()
    try:
        plant = db.query(Plant).filter(Plant.name == "Daman Unit 2").first()
        if not plant:
            print("Plant not found. Run run_seed.py first.")
            return

        # ── Fetch all sheds ────────────────────────────────────────────
        conductor_shed = db.query(Shed).filter(Shed.plant_id == plant.id, Shed.name == "Conductor").first()
        cable_shed     = db.query(Shed).filter(Shed.plant_id == plant.id, Shed.name == "Cable").first()
        others_shed    = db.query(Shed).filter(Shed.plant_id == plant.id, Shed.name == "Others").first()

        if not conductor_shed or not cable_shed or not others_shed:
            print("ERROR: Expected sheds not found")
            return

        # ── 1. Rename MWD → Multiwire ──────────────────────────────────
        mwd_section = db.query(Section).filter(
            Section.shed_id == conductor_shed.id, Section.name == "MWD"
        ).first()
        if mwd_section:
            mwd_section.name = "Multiwire"
            print("✓ Renamed section MWD → Multiwire")

        # ── 2. Move RBD-02 from Others → Conductor → RBD ─────────────
        rbd_section = db.query(Section).filter(
            Section.shed_id == conductor_shed.id, Section.name == "RBD"
        ).first()
        rbd02_machine = db.query(Machine).filter(Machine.name == "RBD-02").first()
        if rbd02_machine and rbd_section:
            rbd02_machine.section_id = rbd_section.id
            rbd02_meter = db.query(EnergyMeter).filter(
                EnergyMeter.machine_id == rbd02_machine.id
            ).first()
            if rbd02_meter:
                rbd02_meter.shed_id    = conductor_shed.id
                rbd02_meter.section_id = rbd_section.id
                print(f"✓ Moved RBD-02 ({rbd02_meter.identification}) → Conductor / RBD")

        # ── 3. Fix ALL meter shed_id / section_id to match machine hierarchy ─
        # Many meters still have shed_id=Others because they were seeded before
        # the machine→section→shed chain was traversed properly.
        all_meters = db.query(EnergyMeter).filter(EnergyMeter.plant_id == plant.id).all()
        fixed_count = 0
        for meter in all_meters:
            if not meter.machine_id:
                continue
            machine = db.query(Machine).filter(Machine.id == meter.machine_id).first()
            if not machine:
                continue
            section = db.query(Section).filter(Section.id == machine.section_id).first()
            if not section:
                continue
            shed = db.query(Shed).filter(Shed.id == section.shed_id).first()
            if not shed:
                continue
            # Fix mismatches
            changed = False
            if meter.section_id != section.id:
                meter.section_id = section.id
                changed = True
            if meter.shed_id != shed.id:
                meter.shed_id = shed.id
                changed = True
            if changed:
                fixed_count += 1
        print(f"✓ Fixed {fixed_count} meter hierarchy mismatches")

        # ── 4. Add missing Cable sections (no meters yet, just structure) ─
        cable_sections_to_add = [
            "Core Rewinding",
            "Cable Rewinding",
            "Curing",
        ]
        for sec_name in cable_sections_to_add:
            exists = db.query(Section).filter(
                Section.shed_id == cable_shed.id, Section.name == sec_name
            ).first()
            if not exists:
                new_sec = Section(shed_id=cable_shed.id, name=sec_name, active=True)
                db.add(new_sec)
                print(f"✓ Added Cable section: {sec_name}")
            else:
                print(f"  Section already exists: {sec_name}")

        # ── 5. Rename "Insulation" → "Extruder" to match reference UI ──
        # Actually keep "Insulation" as the reference also shows Extruder as machine name
        # The reference MOS shows section name "Extruder" with machines Extruder-01..09
        insulation_sec = db.query(Section).filter(
            Section.shed_id == cable_shed.id, Section.name == "Insulation"
        ).first()
        if insulation_sec:
            insulation_sec.name = "Extruder"
            print("✓ Renamed Cable section: Insulation → Extruder")

        db.commit()
        print("\n✅ Hierarchy fix complete.")

        # ── Verification print ─────────────────────────────────────────
        print("\n--- Updated Hierarchy ---")
        for shed in db.query(Shed).filter(Shed.plant_id == plant.id).all():
            print(f"\nShed: {shed.name}")
            for sec in db.query(Section).filter(Section.shed_id == shed.id).all():
                machines = db.query(Machine).filter(Machine.section_id == sec.id).all()
                print(f"  Section: {sec.name} ({len(machines)} machines)")
                for m in machines:
                    mt = db.query(EnergyMeter).filter(EnergyMeter.machine_id == m.id).first()
                    print(f"    {m.name} | {mt.identification if mt else 'no meter'}")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run()
