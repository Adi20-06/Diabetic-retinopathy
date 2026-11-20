import datetime as dt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import models as M, audit, auth

router = APIRouter(tags=["auth"])

class LoginIn(BaseModel): username: str; password: str
class ChangePwIn(BaseModel): old_password: str; new_password: str

def session(u, db):
    c = db.get(M.Centre, u.centre_id) if u.centre_id else None
    return dict(token=auth.make_token(u), role=u.role, name=u.name, username=u.username, patient_id=u.patient_id,
                must_change=bool(u.must_change), centre_id=u.centre_id, centre_name=c.name if c else None)

@router.post("/auth/login")
def login(b: LoginIn, db: Session = Depends(M.get_db)):
    key = b.username.strip()
    u = next((x for x in (db.get(M.User, key), db.get(M.User, key.lower()), db.get(M.User, key.upper())) if x), None)
    t = M.now()
    if u and u.locked_until and u.locked_until > t:
        mins = int((u.locked_until - t).total_seconds() // 60) + 1
        raise HTTPException(423, f"Too many wrong attempts. Try again in {mins} minute(s).")
    if not u or u.active is False or not auth.check_pw(b.password, u.password_hash):
        if u:
            u.failed_attempts = (u.failed_attempts or 0) + 1
            if u.failed_attempts >= auth.MAX_FAILS:
                u.locked_until, u.failed_attempts = t + dt.timedelta(minutes=auth.LOCK_MIN), 0
        audit.log(db, "login_failed", detail={"username": key}); db.commit()
        raise HTTPException(401, "Invalid ID or password")
    u.failed_attempts, u.locked_until = 0, None
    audit.log(db, "login", detail={"by": u.username}); db.commit()
    return session(u, db)

@router.post("/auth/change-password")
def change_password(b: ChangePwIn, db: Session = Depends(M.get_db), u=Depends(auth.current_user_any)):
    if not auth.check_pw(b.old_password, u.password_hash):
        raise HTTPException(400, "Your current password is incorrect")
    err = auth.policy_error(b.new_password, u.username, u.password_hash)
    if err: raise HTTPException(422, err)
    u.password_hash = auth.hash_pw(b.new_password)
    u.must_change, u.failed_attempts, u.password_changed_at = False, 0, M.now()
    audit.log(db, "password_changed", detail={"by": u.username}); db.commit()
    return session(u, db)            # fresh token: the old one stops working

@router.get("/me")
def me(u=Depends(auth.current_user_any), db: Session = Depends(M.get_db)):
    s = session(u, db); s.pop("token")
    return s