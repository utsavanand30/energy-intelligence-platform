from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.plant import Plant
from app.models.user import User
from app.schemas.hierarchy import PlantOut, PlantCreate, PlantUpdate
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/plants", tags=["Plants"])


@router.get("", response_model=List[PlantOut])
def list_plants(active_only: bool = True, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    q = db.query(Plant)
    if active_only:
        q = q.filter(Plant.active == True)
    return q.order_by(Plant.name).all()


@router.get("/{plant_id}", response_model=PlantOut)
def get_plant(plant_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    plant = db.query(Plant).filter(Plant.id == plant_id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return plant


@router.post("", response_model=PlantOut, status_code=201)
def create_plant(body: PlantCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    plant = Plant(**body.model_dump())
    db.add(plant)
    db.commit()
    db.refresh(plant)
    return plant


@router.patch("/{plant_id}", response_model=PlantOut)
def update_plant(plant_id: int, body: PlantUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    plant = db.query(Plant).filter(Plant.id == plant_id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(plant, k, v)
    db.commit()
    db.refresh(plant)
    return plant
