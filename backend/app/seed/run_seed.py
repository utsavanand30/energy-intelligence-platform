"""
Master data seed runner.

Creates Plant → Shed → Section → Machine → EnergyMeter records.
Safe to re-run: uses get_or_create logic.
Also creates the default admin user.

Usage:
    python -m app.seed.run_seed
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.database import SessionLocal, engine, Base
import app.models  # noqa — ensures all tables exist

from app.models.plant import Plant
from app.models.shed import Shed
from app.models.section import Section
from app.models.machine import Machine
from app.models.meter import EnergyMeter, CommunicationProtocol, MeterStatus
from app.models.user import User, UserRole
from app.seed.master_data import PLANT_DATA, HIERARCHY, METER_MAKE_MODEL

import bcrypt


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def get_or_create(db, model, defaults=None, **kwargs):
    instance = db.query(model).filter_by(**kwargs).first()
    if instance:
        return instance, False
    params = {**kwargs, **(defaults or {})}
    instance = model(**params)
    db.add(instance)
    db.flush()
    return instance, True


def run():
    # Ensure all tables exist (idempotent)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # ── 1. Plant ──────────────────────────────────────────────────
        plant, created = get_or_create(
            db, Plant,
            defaults={
                "location": PLANT_DATA["location"],
                "description": PLANT_DATA["description"],
                "active": True,
            },
            name=PLANT_DATA["name"],
        )
        if created:
            print(f"✓ Plant created: {plant.name}")
        else:
            print(f"  Plant exists:  {plant.name}")

        # ── 2. Sheds / Sections / Machines / Meters ───────────────────
        for shed_name, sections_data in HIERARCHY.items():
            shed, _ = get_or_create(
                db, Shed,
                defaults={"active": True},
                plant_id=plant.id, name=shed_name,
            )

            for section_name, section_data in sections_data.items():
                section, _ = get_or_create(
                    db, Section,
                    defaults={"active": True},
                    shed_id=shed.id, name=section_name,
                )

                for m in section_data.get("machines", []):
                    machine, _ = get_or_create(
                        db, Machine,
                        defaults={
                            "machine_type": m["type"],
                            "rated_power_kw": m["rated_kw"],
                            "active": True,
                        },
                        section_id=section.id, name=m["name"],
                    )

                    mm = METER_MAKE_MODEL.get(m["meter"], METER_MAKE_MODEL["default"])
                    meter, mcreated = get_or_create(
                        db, EnergyMeter,
                        defaults={
                            "make": mm["make"],
                            "model": mm["model"],
                            "plant_id": plant.id,
                            "shed_id": shed.id,
                            "section_id": section.id,
                            "machine_id": machine.id,
                            "communication_protocol": CommunicationProtocol.SIMULATED,
                            "communication_status": MeterStatus.OFFLINE,
                            "enabled": True,
                            "ct_ratio": 1.0,
                            "vt_ratio": 1.0,
                        },
                        identification=m["meter"],
                    )
                    if mcreated:
                        print(f"    + Meter {m['meter']} → {m['name']}")

        # ── 3. Default admin user ─────────────────────────────────────
        admin, acreated = get_or_create(
            db, User,
            defaults={
                "email": "admin@plant.local",
                "full_name": "System Administrator",
                "hashed_password": _hash_password("Admin@123"),
                "role": UserRole.ADMIN,
                "active": True,
            },
            username="admin",
        )
        if acreated:
            print(f"✓ Admin user created: admin / Admin@123")
        else:
            print(f"  Admin user exists.")

        db.commit()
        print("✅ Master data seed complete.")

    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
