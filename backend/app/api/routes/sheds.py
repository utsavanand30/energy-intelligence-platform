from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.shed import Shed
from app.schemas.hierarchy import ShedOut, ShedCreate, ShedUpdate

router = APIRouter(prefix="/sheds", tags=["Sheds"])


@router.get("", response_model=List[ShedOut])
def list_sheds(plant_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(Shed).filter(Shed.active == True)
    if plant_id:
        q = q.filter(Shed.plant_id == plant_id)
    return q.order_by(Shed.name).all()


@router.get("/{shed_id}", response_model=ShedOut)
def get_shed(shed_id: int, db: Session = Depends(get_db)):
    shed = db.query(Shed).filter(Shed.id == shed_id).first()
    if not shed:
        raise HTTPException(status_code=404, detail="Shed not found")
    return shed


@router.post("", response_model=ShedOut, status_code=201)
def create_shed(body: ShedCreate, db: Session = Depends(get_db)):
    shed = Shed(**body.model_dump())
    db.add(shed)
    db.commit()
    db.refresh(shed)
    return shed


@router.patch("/{shed_id}", response_model=ShedOut)
def update_shed(shed_id: int, body: ShedUpdate, db: Session = Depends(get_db)):
    shed = db.query(Shed).filter(Shed.id == shed_id).first()
    if not shed:
        raise HTTPException(status_code=404, detail="Shed not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(shed, k, v)
    db.commit()
    db.refresh(shed)
    return shed
