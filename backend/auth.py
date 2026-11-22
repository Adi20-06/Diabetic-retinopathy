import os, re, hmac, hashlib, secrets, time, datetime as dt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import models as M
from settings import JWT_SECRET, TOKEN_MINUTES

MAX_FAILS, LOCK_MIN, ITER = 5, 10, 600_000

def _h(pw, salt, it): return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, it).hex()

def hash_pw(pw: str) -> str:
    salt = os.urandom(16)
    return f"pbkdf2${ITER}${salt.hex()}${_h(pw, salt, ITER)}"

def check_pw(pw: str, stored: str) -> bool:
    try:
        if stored.startswith("pbkdf2$"):
            _, it, salt, h = stored.split("$"); it = int(it)
        else:                                    # older format: salt:hash at 200k rounds
            salt, h = stored.split(":"); it = 200_000
        return hmac.compare_digest(_h(pw, bytes.fromhex(salt), it), h)
    except Exception:
        return False

def needs_rehash(stored: str) -> bool: return not stored.startswith(f"pbkdf2${ITER}$")

_DUMMY = hash_pw("timing-equaliser")
def dummy_check(pw: str): check_pw(pw, _DUMMY)      # unknown users cost the same time as known ones

# ---- failed-login throttle (per process). Same behaviour for real and made-up usernames. ----
WINDOW = 600
_fails: dict[str, list[float]] = {}
def _recent(key):
    now = time.time(); l = [t for t in _fails.get(key, []) if now - t < WINDOW]
    if l: _fails[key] = l
    else: _fails.pop(key, None)
    return l
def blocked(key: str, limit: int) -> int:
    """Seconds left if blocked, else 0."""
    l = _recent(key)
    return int(l[0] + WINDOW - time.time()) + 1 if len(l) >= limit else 0
def record_fail(key: str):
    if len(_fails) > 20000: _fails.clear()
    _fails.setdefault(key, []).append(time.time())
def clear_fails(key: str): _fails.pop(key, None)

def temp_password() -> str:
    letters, digits = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ", "23456789"
    s = [secrets.choice(letters) for _ in range(7)] + [secrets.choice(digits) for _ in range(3)]
    secrets.SystemRandom().shuffle(s)
    return "".join(s)

BAD_WORDS = ("password", "welcome", "qwerty", "admin", "letmein", "nurse", "doctor", "patient", "india",
             "health", "diabetes", "retina", "hospital", "iloveyou", "abcdef", "changeme")

def policy_error(pw: str, username: str, old_hash: str | None = None) -> str | None:
    if len(pw) < 10: return "Use at least 10 characters"
    if len(pw) > 128: return "Use at most 128 characters"
    if not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw): return "Use both letters and numbers"
    if username.lower() in pw.lower(): return "The password must not contain your ID or username"
    core = re.sub(r"[^a-z]", "", pw.lower())
    if any(w in core for w in BAD_WORDS) or len(set(pw)) <= 3:
        return "Too easy to guess. Avoid common words and repeated characters"
    if old_hash and check_pw(pw, old_hash): return "The new password must be different from the old one"
    return None

def _pv(u) -> int: return int(u.password_changed_at.timestamp() * 1000) if u.password_changed_at else 0

def make_token(u) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    return jwt.encode({"sub": u.username, "role": u.role, "pv": _pv(u), "iat": now,
                       "exp": now + dt.timedelta(minutes=TOKEN_MINUTES)}, JWT_SECRET, algorithm="HS256")

bearer = HTTPBearer(auto_error=False)      # a missing token is our own clean 401, not FastAPI's 403

def current_user_any(request: Request, cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(M.get_db)):
    unauth = HTTPException(401, "Session expired or invalid, please log in again", headers={"WWW-Authenticate": "Bearer"})
    if not cred or cred.scheme.lower() != "bearer": raise unauth
    try:
        data = jwt.decode(cred.credentials, JWT_SECRET, algorithms=["HS256"], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        raise unauth
    u = db.get(M.User, data["sub"])
    if not u or u.active is False or data.get("pv") != _pv(u): raise unauth
    request.state.user = u.username
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
    p = db.get(M.Patient, patient_id)
    if not p or p.centre_id != u.centre_id: raise HTTPException(404, "Not found")
    return p

