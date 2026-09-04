from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.section import Section
from app.models.shed import Shed
from app.models.user import User
from app.schemas.hierarchy import SectionOut, SectionCreate, SectionUpdate
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/sections", tags=["Sections"])


@router.get("", response_model=List[SectionOut])
def list_sections(
    shed_id: Optional[int] = None,
    plant_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user)
):
    q = db.query(Section).filter(Section.active == True)
    if shed_id:
        q = q.filter(Section.shed_id == shed_id)
    elif plant_id:
        shed_ids = [s.id for s in db.query(Shed.id).filter(Shed.plant_id == plant_id).all()]
        q = q.filter(Section.shed_id.in_(shed_ids))
    return q.order_by(Section.name).all()


@router.get("/{section_id}", response_model=SectionOut)
def get_section(section_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return section


@router.post("", response_model=SectionOut, status_code=201)
def create_section(body: SectionCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    section = Section(**body.model_dump())
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


@router.patch("/{section_id}", response_model=SectionOut)
def update_section(section_id: int, body: SectionUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    section = db.query(Section).filter(Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(section, k, v)
    db.commit()
    db.refresh(section)
    return section
