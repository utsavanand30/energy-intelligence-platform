from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from app.core.database import get_db
from app.models.machine import Machine
from app.models.section import Section
from app.models.shed import Shed
from app.schemas.hierarchy import MachineOut, MachineCreate, MachineUpdate

router = APIRouter(prefix="/machines", tags=["Machines"])


def _enrich(m: Machine) -> MachineOut:
    out = MachineOut.model_validate(m)
    if m.section:
        out.section_name = m.section.name
        if m.section.shed:
            out.shed_name = m.section.shed.name
            if m.section.shed.plant:
                out.plant_name = m.section.shed.plant.name
    return out


@router.get("", response_model=List[MachineOut])
def list_machines(
    section_id: Optional[int] = None,
    shed_id: Optional[int] = None,
    plant_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = (
        db.query(Machine)
        .options(
            joinedload(Machine.section)
            .joinedload(Section.shed)
            .joinedload(Shed.plant)
        )
        .filter(Machine.active == True)
    )
    if section_id:
        q = q.filter(Machine.section_id == section_id)
    elif shed_id:
        section_ids = [s.id for s in db.query(Section.id).filter(Section.shed_id == shed_id)]
        q = q.filter(Machine.section_id.in_(section_ids))
    elif plant_id:
        shed_ids = [s.id for s in db.query(Shed.id).filter(Shed.plant_id == plant_id)]
        section_ids = [s.id for s in db.query(Section.id).filter(Section.shed_id.in_(shed_ids))]
        q = q.filter(Machine.section_id.in_(section_ids))
    return [_enrich(m) for m in q.order_by(Machine.name).all()]


@router.get("/{machine_id}", response_model=MachineOut)
def get_machine(machine_id: int, db: Session = Depends(get_db)):
    m = (
        db.query(Machine)
        .options(
            joinedload(Machine.section)
            .joinedload(Section.shed)
            .joinedload(Shed.plant)
        )
        .filter(Machine.id == machine_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Machine not found")
    return _enrich(m)


@router.post("", response_model=MachineOut, status_code=201)
def create_machine(body: MachineCreate, db: Session = Depends(get_db)):
    machine = Machine(**body.model_dump())
    db.add(machine)
    db.commit()
    db.refresh(machine)
    return MachineOut.model_validate(machine)


@router.patch("/{machine_id}", response_model=MachineOut)
def update_machine(machine_id: int, body: MachineUpdate, db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(machine, k, v)
    db.commit()
    db.refresh(machine)
    return MachineOut.model_validate(machine)
