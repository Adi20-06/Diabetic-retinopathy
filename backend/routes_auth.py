from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import models as M, audit, auth
from settings import DEMO_OTP
import os

router = APIRouter(tags=["auth"])

class LoginIn(BaseModel): username: str; password: str
class OtpIn(BaseModel): otp: str; mobile: str | None = None; patient_id: str | None = None
class RegisterIn(BaseModel):
    name: str = Field(min_length=2); dob: str; gender: str
    mobile: str = Field(pattern=r"^\d{10}$"); password: str = Field(min_length=6); consent: bool

def session(u):
    return dict(token=auth.make_token(u), role=u.role, name=u.name, username=u.username, patient_id=u.patient_id)

@router.post("/auth/login")
def login(b: LoginIn, db: Session = Depends(M.get_db)):
    u = db.get(M.User, b.username)
    if not u or not auth.check_pw(b.password, u.password_hash):
        audit.log(db, "login_failed", detail={"username": b.username}); db.commit()
        raise HTTPException(401, "Invalid username or password")
    audit.log(db, "login", detail={"by": u.username}); db.commit()
    return session(u)

@router.post("/auth/otp-login")
def otp_login(b: OtpIn, db: Session = Depends(M.get_db)):
    bad = HTTPException(401, "Invalid OTP, or this mobile number is not registered")
    if b.otp != DEMO_OTP: raise bad
    p = db.query(M.Patient).filter_by(mobile=b.mobile).first() if b.mobile else (db.get(M.Patient, b.patient_id) if b.patient_id else None)
    if not p: raise bad
    u = db.query(M.User).filter_by(patient_id=p.id, role="patient").first()
    if not u:   # patient registered by a nurse: the first OTP login creates their account (no password set)
        u = M.User(username=p.id, password_hash=auth.hash_pw(os.urandom(8).hex()), role="patient", name=p.name, patient_id=p.id)
        db.add(u); db.flush()
    audit.log(db, "login_otp", detail={"by": u.username}); db.commit()
    return session(u)

@router.post("/auth/register")
def register(b: RegisterIn, db: Session = Depends(M.get_db)):
    if not b.consent: raise HTTPException(422, "Consent is required")
    if db.query(M.Patient).filter_by(mobile=b.mobile).first():
        raise HTTPException(409, "This mobile number is already registered. Sign in with the mobile OTP.")
    pid = M.next_patient_id(db)
    db.add(M.Patient(id=pid, name=b.name, dob=b.dob, gender=b.gender, mobile=b.mobile, consent=True, created_by="self"))
    db.flush()
    db.add(M.User(username=pid, password_hash=auth.hash_pw(b.password), role="patient", name=b.name, patient_id=pid))
    audit.log(db, "patient_self_registered", detail={"patient_id": pid}); db.commit()
    return {"patient_id": pid}

@router.get("/me")
def me(u=Depends(auth.current_user)):
    return dict(username=u.username, role=u.role, name=u.name, patient_id=u.patient_id)