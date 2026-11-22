from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session
import models as M, audit, auth
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from settings import CONSENT_VERSION
import datetime as dt

router = APIRouter(tags=["people"])

class PatientIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    dob: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    gender: Literal["Female", "Male", "Other"]
    mobile: str = Field(pattern=r"^\d{10}$"); consent: bool = True
    history: str = Field("", max_length=200); id_verified: bool = False
class ApptIn(BaseModel): date: str = Field(max_length=10); reason: str = Field(min_length=2, max_length=80)

def pj(p):
    return dict(id=p.id, name=p.name, dob=p.dob, gender=p.gender, mobile=p.mobile, verified=bool(p.verified),
                created_at=p.created_at.isoformat() if p.created_at else None, history=p.history or "", registered_by=p.created_by)

def aj(a):
    return dict(id=a.id, patient_id=a.patient_id, date=a.date, reason=a.reason, status=a.status,
                created_at=a.created_at.isoformat())

@router.get("/patients")
def search(q: str = Query("", max_length=60), db: Session = Depends(M.get_db), u=Depends(auth.require("nurse", "doctor"))):
    qs = db.query(M.Patient).filter(M.Patient.centre_id == u.centre_id, M.Patient.anonymized_at.is_(None))
    if q.strip():
        t = f"%{q.strip()}%"
        qs = qs.filter(or_(M.Patient.name.ilike(t), M.Patient.id.ilike(t), M.Patient.mobile.like(t)))
    return [pj(p) for p in qs.order_by(M.Patient.id).limit(200)]

@router.post("/patients")
def add(b: PatientIn, force: bool = False, db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    if not b.consent: raise HTTPException(422, "Consent is required")
    dups = db.query(M.Patient).filter(M.Patient.centre_id == u.centre_id, M.Patient.anonymized_at.is_(None),
            or_(M.Patient.mobile == b.mobile, (M.Patient.name.ilike(b.name)) & (M.Patient.dob == b.dob))).all()
    if dups and not force:   # same mobile, or same name and birth date, within this centre
        raise HTTPException(409, {"message": "Possible duplicate patient", "matches": [pj(p) for p in dups]})
    pid = M.next_patient_id(db)
    p = M.Patient(id=pid, name=b.name, dob=b.dob, gender=b.gender, mobile=b.mobile, history=b.history,
                  verified=b.id_verified, consent=True, created_by=u.username, centre_id=u.centre_id ,
                  consent_version=CONSENT_VERSION, consent_at=M.now(), consent_by=u.username)
    db.add(p); db.flush()
    tmp = auth.temp_password()          # shown to the nurse once; the patient must change it at first login
    db.add(M.User(username=pid, password_hash=auth.hash_pw(tmp), role="patient", name=b.name,
                  patient_id=pid, centre_id=u.centre_id, must_change=True))
    audit.log(db, "patient_registered", detail={"by": u.username, "patient_id": pid}); db.commit()
    return {**pj(p), "temp_password": tmp}

@router.post("/patients/{pid}/reset-password")
def reset_patient_password(pid: str, db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    p = auth.ensure_centre(db, u, pid)
    tmp = auth.temp_password()
    acc = db.query(M.User).filter_by(patient_id=pid, role="patient").first()
    if not acc:      # patients registered before the login upgrade have no account yet
        db.add(M.User(username=pid, password_hash=auth.hash_pw(tmp), role="patient", name=p.name,
                      patient_id=pid, centre_id=u.centre_id, must_change=True))
    else:
        acc.password_hash, acc.must_change = auth.hash_pw(tmp), True
        acc.failed_attempts, acc.locked_until, acc.password_changed_at = 0, None, M.now()
        auth.clear_fails(f"user:{u.username.lower()}")      # in routes_admin.reset
    auth.clear_fails(f"user:{acc.username.lower()}")    # in routes_people.reset_patient_password
    audit.log(db, "password_reset", detail={"by": u.username, "patient_id": pid}); db.commit()
    return {"patient_id": pid, "temp_password": tmp}

@router.get("/patients/{pid}")
def get(pid: str, db: Session = Depends(M.get_db), u=Depends(auth.current_user)):
    if u.role == "patient":
        if u.patient_id != pid: raise HTTPException(403, "Not your record")
        p = db.get(M.Patient, pid)
        if not p: raise HTTPException(404, "Patient not found")
    else:
        p = auth.ensure_centre(db, u, pid)
    return pj(p)

@router.post("/patients/{pid}/verify")
def verify(pid: str, db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    p = auth.ensure_centre(db, u, pid)
    p.verified = True
    audit.log(db, "patient_verified", detail={"by": u.username, "patient_id": pid}); db.commit()
    return pj(p)

@router.post("/appointments")
def request_appt(b: ApptIn, db: Session = Depends(M.get_db), u=Depends(auth.require("patient"))):
    M.lock(db, 3)
    nums = [int(i[4:]) for (i,) in db.query(M.Appointment.id) if i[4:].isdigit()]
    a = M.Appointment(id=f"APT-{max([1000] + nums) + 1}", patient_id=u.patient_id, date=b.date, reason=b.reason)
    db.add(a); audit.log(db, "appointment_requested", detail={"by": u.username, "id": a.id}); db.commit()
    return aj(a)

@router.get("/appointments")
def list_appts(db: Session = Depends(M.get_db), u=Depends(auth.current_user)):
    qs = db.query(M.Appointment)
    if u.role == "patient": qs = qs.filter_by(patient_id=u.patient_id)
    else:
        qs = qs.join(M.Patient, M.Patient.id == M.Appointment.patient_id).filter(M.Patient.centre_id == u.centre_id)
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
    auth.ensure_centre(db, u, a.patient_id)
    if a.status == "cancelled": raise HTTPException(409, "A cancelled appointment cannot be confirmed")
    a.status = "confirmed"
    audit.log(db, "appointment_confirmed", detail={"by": u.username, "id": aid}); db.commit()
    return aj(a)

@router.get("/doctors")
def doctors(db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    qs = db.query(M.User).filter(M.User.role == "doctor", M.User.centre_id == u.centre_id)
    return [dict(username=d.username, name=d.name) for d in qs.order_by(M.User.name) if d.active is not False]

@router.get("/me/export")
def export_my_data(db: Session = Depends(M.get_db), u=Depends(auth.require("patient"))):
    from routes_screenings import patient_view
    p = db.get(M.Patient, u.patient_id)
    ss = db.query(M.Screening).filter_by(patient_id=p.id).order_by(M.Screening.created_at).all()
    appts = db.query(M.Appointment).filter_by(patient_id=p.id).all()
    audit.log(db, "data_export", detail={"by": u.username}); db.commit()
    return dict(exported_at=M.now().isoformat(), profile=pj(p),
                consent=dict(version=p.consent_version, at=p.consent_at.isoformat() if p.consent_at else None, recorded_by=p.consent_by),
                screenings=[patient_view(db, s) for s in ss], appointments=[aj(a) for a in appts])