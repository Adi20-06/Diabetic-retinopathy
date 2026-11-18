import os, hmac, hashlib, datetime as dt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import models as M
from settings import JWT_SECRET

def hash_pw(pw: str) -> str:
    salt = os.urandom(16)
    return salt.hex() + ":" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000).hex()

def check_pw(pw: str, stored: str) -> bool:
    salt, h = stored.split(":")
    return hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex(), h)

def make_token(u) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=8)
    return jwt.encode({"sub": u.username, "role": u.role, "exp": exp}, JWT_SECRET, algorithm="HS256")

bearer = HTTPBearer()

def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(M.get_db)):
    try:
        data = jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired or invalid, please log in again")
    u = db.get(M.User, data["sub"])
    if not u: raise HTTPException(401, "Unknown user")
    return u

def require(*roles):
    def dep(u=Depends(current_user)):
        if u.role not in roles: raise HTTPException(403, "Your role cannot do this")
        return u
    return dep