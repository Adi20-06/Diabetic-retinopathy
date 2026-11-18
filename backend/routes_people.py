from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session
import models as M, audit, auth

router = APIRouter(tags=["people"])

class PatientIn(BaseModel):
    name: str = Field(min_length=2); dob: str; gender: str
    mobile: str = Field(pattern=r"^\d{10}$"); consent: bool = True
    history: str=""; id_verified: bool = False;
class ApptIn(BaseModel): date: str; reason: str

def pj(p):
    return dict(id=p.id, name=p.name, dob=p.dob, gender=p.gender, mobile=p.mobile, verified=bool(p.verified),
                created_at=p.created_at.isoformat() if p.created_at else None, history=p.history or "", registered_by=p.created_by)

def aj(a):
    return dict(id=a.id, patient_id=a.patient_id, date=a.date, reason=a.reason, status=a.status,
                created_at=a.created_at.isoformat())

@router.get("/patients")
def search(q: str = "", db: Session = Depends(M.get_db), u=Depends(auth.require("nurse", "doctor"))):
    qs = db.query(M.Patient)
    if q.strip():
        t = f"%{q.strip()}%"
        qs = qs.filter(or_(M.Patient.name.ilike(t), M.Patient.id.ilike(t), M.Patient.mobile.like(t)))
    return [pj(p) for p in qs.order_by(M.Patient.id).limit(200)]

@router.post("/patients")
def add(b: PatientIn, force: bool = False, db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    if not b.consent: raise HTTPException(422, "Consent is required")
    dups = db.query(M.Patient).filter(or_(M.Patient.mobile == b.mobile,
            (M.Patient.name.ilike(b.name)) & (M.Patient.dob == b.dob))).all()
    if dups and not force:   # same mobile, or same name and birth date
        raise HTTPException(409, {"message": "Possible duplicate patient", "matches": [pj(p) for p in dups]})
    pid = M.next_patient_id(db)
    p = M.Patient(id=pid, name=b.name, dob=b.dob, gender=b.gender, mobile=b.mobile, history=b.history,
                  verified=b.id_verified, consent=True, created_by=u.username)
    db.add(p); audit.log(db, "patient_registered", detail={"by": u.username, "patient_id": pid}); db.commit()
    return pj(p)

@router.get("/patients/{pid}")
def get(pid: str, db: Session = Depends(M.get_db), u=Depends(auth.current_user)):
    if u.role == "patient" and u.patient_id != pid: raise HTTPException(403, "Not your record")
    p = db.get(M.Patient, pid)
    if not p: raise HTTPException(404, "Patient not found")
    return pj(p)

@router.post("/patients/{pid}/verify")
def verify(pid: str, db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    p = db.get(M.Patient, pid)
    if not p: raise HTTPException(404, "Patient not found")
    p.verified = True
    audit.log(db, "patient_verified", detail={"by": u.username, "patient_id": pid}); db.commit()
    return pj(p)

@router.post("/appointments")
def request_appt(b: ApptIn, db: Session = Depends(M.get_db), u=Depends(auth.require("patient"))):
    n = db.query(M.Appointment).count()
    a = M.Appointment(id=f"APT-{1001 + n}", patient_id=u.patient_id, date=b.date, reason=b.reason)
    db.add(a); audit.log(db, "appointment_requested", detail={"by": u.username, "id": a.id}); db.commit()
    return aj(a)

@router.get("/appointments")
def list_appts(db: Session = Depends(M.get_db), u=Depends(auth.current_user)):
    qs = db.query(M.Appointment)
    if u.role == "patient": qs = qs.filter_by(patient_id=u.patient_id)
    return [aj(a) for a in qs.order_by(M.Appointment.created_at.desc())]

@router.post("/appointments/{aid}/cancel")
def cancel(aid: str, db: Session = Depends(M.get_db), u=Depends(auth.require("patient"))):
    a = db.get(M.Appointment, aid)
    if not a or a.patient_id != u.patient_id: raise HTTPException(404, "Appointment not found")
    a.status = "cancelled"
    audit.log(db, "appointment_cancelled", detail={"by": u.username, "id": aid}); db.commit()
    return aj(a)

@router.post("/appointments/{aid}/confirm")
def confirm(aid: str, db: Session = Depends(M.get_db), u=Depends(auth.require("nurse", "doctor"))):
    a = db.get(M.Appointment, aid)
    if not a: raise HTTPException(404, "Appointment not found")
    if a.status == "cancelled": raise HTTPException(409, "A cancelled appointment cannot be confirmed")
    a.status = "confirmed"
    audit.log(db, "appointment_confirmed", detail={"by": u.username, "id": aid}); db.commit()
    return aj(a)