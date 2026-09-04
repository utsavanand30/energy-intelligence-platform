from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.models.alert import Alert, AlertStatus, AlertSeverity
from app.models.machine import Machine
from app.models.meter import EnergyMeter
from app.models.user import User
from app.schemas.energy import AlertOut
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=List[AlertOut])
def list_alerts(
    plant_id: Optional[int] = None,
    severity: Optional[str] = None,
    status: Optional[str] = Query(None, pattern="^(ACTIVE|ACKNOWLEDGED|RESOLVED)$"),
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user)
):
    q = db.query(Alert)
    if status:
        q = q.filter(Alert.status == status)
    else:
        q = q.filter(Alert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]))
    if severity:
        q = q.filter(Alert.severity == severity)
    alerts = q.order_by(Alert.fired_at.desc()).limit(limit).all()

    result = []
    for a in alerts:
        machine_name = None
        meter_id_str = None
        if a.machine_id:
            m = db.query(Machine).filter(Machine.id == a.machine_id).first()
            machine_name = m.name if m else None
        if a.meter_id:
            mt = db.query(EnergyMeter).filter(EnergyMeter.id == a.meter_id).first()
            meter_id_str = mt.identification if mt else None

        result.append(AlertOut(
            id=a.id,
            alert_type=a.alert_type.value,
            severity=a.severity.value,
            status=a.status.value,
            message=a.message,
            machine_name=machine_name,
            meter_identification=meter_id_str,
            value=a.value,
            threshold=a.threshold,
            fired_at=a.fired_at,
            acknowledged_at=a.acknowledged_at,
            resolved_at=a.resolved_at,
        ))
    return result


@router.patch("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = AlertStatus.ACKNOWLEDGED
    alert.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "acknowledged"}


@router.patch("/{alert_id}/resolve")
def resolve_alert(alert_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = AlertStatus.RESOLVED
    alert.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "resolved"}
