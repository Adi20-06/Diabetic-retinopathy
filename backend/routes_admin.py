import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import models as M, audit, auth

router = APIRouter(tags=["admin"], prefix="/admin")

class StaffIn(BaseModel): username: str; name: str; role: str
class ActiveIn(BaseModel): active: bool

def sj(u):
    return dict(username=u.username, name=u.name, role=u.role, active=u.active is not False,
                must_change=bool(u.must_change), locked=bool(u.locked_until and u.locked_until > M.now()))

def staff_of(db, admin, username):
    u = db.get(M.User, username)       # only nurses and doctors of the admin's own centre
    if not u or u.centre_id != admin.centre_id or u.role not in ("nurse", "doctor"): raise HTTPException(404, "Staff member not found")
    return u

@router.get("/staff")
def list_staff(db: Session = Depends(M.get_db), a=Depends(auth.require("admin"))):
    qs = db.query(M.User).filter(M.User.centre_id == a.centre_id, M.User.role.in_(["nurse", "doctor"]))
    return [sj(u) for u in qs.order_by(M.User.role, M.User.username)]

@router.post("/staff")
def add_staff(b: StaffIn, db: Session = Depends(M.get_db), a=Depends(auth.require("admin"))):
    uname = b.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9._-]{3,30}", uname): raise HTTPException(422, "Username: 3-30 characters, lowercase letters, digits, . _ -")
    if b.role not in ("nurse", "doctor"): raise HTTPException(422, "Role must be nurse or doctor")
    if len(b.name.strip()) < 2: raise HTTPException(422, "Enter the person's name")
    if db.get(M.User, uname): raise HTTPException(409, "This username is already taken. Try another")
    tmp = auth.temp_password()
    u = M.User(username=uname, password_hash=auth.hash_pw(tmp), role=b.role, name=b.name.strip(), centre_id=a.centre_id, must_change=True)
    db.add(u); audit.log(db, "staff_added", detail={"by": a.username, "username": uname, "role": b.role}); db.commit()
    return {**sj(u), "temp_password": tmp}

@router.post("/staff/{username}/reset-password")
def reset(username: str, db: Session = Depends(M.get_db), a=Depends(auth.require("admin"))):
    u = staff_of(db, a, username)
    tmp = auth.temp_password()
    u.password_hash, u.must_change = auth.hash_pw(tmp), True
    u.failed_attempts, u.locked_until, u.password_changed_at = 0, None, M.now()
    audit.log(db, "password_reset", detail={"by": a.username, "username": username}); db.commit()
    return {**sj(u), "temp_password": tmp}

@router.post("/staff/{username}/active")
def set_active(username: str, b: ActiveIn, db: Session = Depends(M.get_db), a=Depends(auth.require("admin"))):
    u = staff_of(db, a, username)
    u.active, u.password_changed_at = b.active, M.now()          # also ends their open sessions
    audit.log(db, "staff_enabled" if b.active else "staff_disabled", detail={"by": a.username, "username": username}); db.commit()
    return sj(u)