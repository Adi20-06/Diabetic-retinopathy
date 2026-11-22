import datetime as dt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import models as M, audit, auth

router = APIRouter(tags=["auth"])

class LoginIn(BaseModel): username: str = Field(min_length=1, max_length=60); password: str = Field(min_length=1, max_length=128)
class ChangePwIn(BaseModel): old_password: str = Field(max_length=128); new_password: str = Field(max_length=128)

def session(u, db):
    c = db.get(M.Centre, u.centre_id) if u.centre_id else None
    return dict(token=auth.make_token(u), role=u.role, name=u.name, username=u.username, patient_id=u.patient_id,
                must_change=bool(u.must_change), centre_id=u.centre_id, centre_name=c.name if c else None)

def _locked(wait):
    return HTTPException(423, f"Too many wrong attempts. Try again in {wait // 60 + 1} minute(s).")

@router.post("/auth/login")
def login(b: LoginIn, request: Request, db: Session = Depends(M.get_db)):
    key = b.username.strip()[:40]
    ip = request.client.host if request.client else "?"
    ukey = f"user:{key.lower()}"
    u = next((x for x in (db.get(M.User, key), db.get(M.User, key.lower()), db.get(M.User, key.upper())) if x), None)
    t = M.now()
    wait = max(auth.blocked(f"ip:{ip}", 20), auth.blocked(ukey, auth.MAX_FAILS))
    if u and u.locked_until and u.locked_until > t: wait = max(wait, int((u.locked_until - t).total_seconds()))
    if wait: raise _locked(wait)

    ok = False
    if u and u.active is not False: ok = auth.check_pw(b.password, u.password_hash)
    else: auth.dummy_check(b.password)
    if not ok:
        auth.record_fail(f"ip:{ip}"); auth.record_fail(ukey)
        if u:
            u.failed_attempts = (u.failed_attempts or 0) + 1
            if u.failed_attempts >= auth.MAX_FAILS:
                u.locked_until, u.failed_attempts = t + dt.timedelta(minutes=auth.LOCK_MIN), 0
        audit.log(db, "login_failed", detail={"username": key, "ip": ip}); db.commit()
        raise HTTPException(401, "Invalid ID or password")

    auth.clear_fails(ukey)
    u.failed_attempts, u.locked_until = 0, None
    if auth.needs_rehash(u.password_hash): u.password_hash = auth.hash_pw(b.password)   # silent upgrade
    audit.log(db, "login", detail={"by": u.username, "ip": ip}); db.commit()
    return session(u, db)

@router.post("/auth/refresh")
def refresh(db: Session = Depends(M.get_db), u=Depends(auth.current_user_any)):
    return session(u, db)               # a fresh 30-minute token for an active, still-valid session

@router.post("/auth/change-password")
def change_password(b: ChangePwIn, db: Session = Depends(M.get_db), u=Depends(auth.current_user_any)):
    ukey = f"user:{u.username.lower()}"
    wait = auth.blocked(ukey, auth.MAX_FAILS)
    if wait: raise _locked(wait)
    if not auth.check_pw(b.old_password, u.password_hash):
        auth.record_fail(ukey)          # a stolen token cannot be used to guess the old password
        raise HTTPException(400, "Your current password is incorrect")
    err = auth.policy_error(b.new_password, u.username, u.password_hash)
    if err: raise HTTPException(422, err)
    u.password_hash = auth.hash_pw(b.new_password)
    u.must_change, u.failed_attempts, u.password_changed_at = False, 0, M.now()
    audit.log(db, "password_changed", detail={"by": u.username}); db.commit()
    return session(u, db)

@router.get("/me")
def me(u=Depends(auth.current_user_any), db: Session = Depends(M.get_db)):
    s = session(u, db); s.pop("token")
    return s