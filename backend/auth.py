import os, re, hmac, hashlib, secrets, datetime as dt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import models as M
from settings import JWT_SECRET

MAX_FAILS, LOCK_MIN = 5, 10

def hash_pw(pw: str) -> str:
    salt = os.urandom(16)
    return salt.hex() + ":" + hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000).hex()

def check_pw(pw: str, stored: str) -> bool:
    salt, h = stored.split(":")
    return hmac.compare_digest(hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 200_000).hex(), h)

def temp_password() -> str:
    """10 readable characters (no 0/O/1/l confusion), always letters and digits."""
    letters, digits = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ", "23456789"
    s = [secrets.choice(letters) for _ in range(7)] + [secrets.choice(digits) for _ in range(3)]
    secrets.SystemRandom().shuffle(s)
    return "".join(s)

BAD_WORDS = ("password", "welcome", "qwerty", "admin", "letmein", "nurse", "doctor", "patient", "india",
             "health", "diabetes", "retina", "hospital", "iloveyou", "abcdef", "changeme")

def policy_error(pw: str, username: str, old_hash: str | None = None) -> str | None:
    """Returns a message if the password is not allowed, else None."""
    if len(pw) < 10: return "Use at least 10 characters"
    if len(pw) > 128: return "Use at most 128 characters"
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw): return "Use both letters and numbers"
    if username.lower() in pw.lower(): return "The password must not contain your ID or username"
    core = re.sub(r"[^a-z]", "", pw.lower())
    if any(w in core for w in BAD_WORDS) or len(set(pw)) <= 3:
        return "Too easy to guess. Avoid common words and repeated characters"
    if old_hash and check_pw(pw, old_hash): return "The new password must be different from the old one"
    return None

def _pv(u) -> int:
    return int(u.password_changed_at.timestamp()) if u.password_changed_at else 0

def make_token(u) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=8)
    # "pv" changes whenever the password changes, so older tokens stop working
    return jwt.encode({"sub": u.username, "role": u.role, "pv": _pv(u), "exp": exp}, JWT_SECRET, algorithm="HS256")

bearer = HTTPBearer()

def current_user_any(cred: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(M.get_db)):
    """Valid session, even if the password still has to be changed."""
    try:
        data = jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired or invalid, please log in again")
    u = db.get(M.User, data["sub"])
    if not u or u.active is False or data.get("pv") != _pv(u):
        raise HTTPException(401, "Session expired or invalid, please log in again")
    return u

def current_user(u=Depends(current_user_any)):
    if u.must_change: raise HTTPException(403, "You must change your temporary password first")
    return u

def require(*roles):
    def dep(u=Depends(current_user)):
        if u.role not in roles: raise HTTPException(403, "Your role cannot do this")
        return u
    return dep

def ensure_centre(db: Session, u, patient_id: str):
    """Staff may only touch patients of their own centre. 404 (not 403) so other centres' records are not revealed."""
    p = db.get(M.Patient, patient_id)
    if not p or p.centre_id != u.centre_id: raise HTTPException(404, "Not found")
    return p