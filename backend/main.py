from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text , inspect
import models as M, storage, audit, auth
import routes_auth, routes_people
import routes_auth, routes_people, routes_screenings
from settings import CORS_ORIGINS
import routes_admin
from fastapi.responses import JSONResponse
from settings import CORS_ORIGINS, ENV
from pathlib import Path
from alembic import command
from alembic.config import Config
import time, uuid
from logging_setup import log, setup_logging
setup_logging()
import pipeline
from fastapi.responses import JSONResponse
from contextlib import contextmanager

PROD = ENV == "production"
MAX_BODY = 90 * 1024 * 1024
app = FastAPI(title="DR Triage API", docs_url=None if PROD else "/docs", redoc_url=None,
              openapi_url=None if PROD else "/openapi.json")

@app.middleware("http")
async def guard_and_log(request, call_next):
    rid = uuid.uuid4().hex[:12]
    t0 = time.perf_counter()
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_BODY:
        r = JSONResponse({"detail": "Upload too large"}, status_code=413)
    else:
        try:
            r = await call_next(request)
        except Exception:
            log.exception(f"UNHANDLED ERROR {request.method} {request.url.path}", extra=dict(rid=rid))
            r = JSONResponse({"detail": "Something went wrong on the server", "request_id": rid}, status_code=500)
    ms = int((time.perf_counter() - t0) * 1000)
    r.headers["X-Request-ID"] = rid
    r.headers["Cache-Control"] = "no-store"
    r.headers["X-Content-Type-Options"] = "nosniff"
    r.headers["X-Frame-Options"] = "DENY"
    r.headers["Referrer-Policy"] = "no-referrer"
    r.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if PROD: r.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if not (request.url.path.startswith("/health") and r.status_code == 200):
        level = log.error if r.status_code >= 500 else log.warning if (r.status_code in (401, 403, 423, 429) or ms > 3000) else log.info
        level(f"{request.method} {request.url.path} {r.status_code} {ms}ms", extra=dict(
            rid=rid, method=request.method, path=request.url.path, status=r.status_code, ms=ms,
            user=getattr(request.state, "user", None), ip=request.client.host if request.client else None))
    return r

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"],expose_headers=["X-Total-Count"], max_age=600)
app.include_router(routes_auth.router)
app.include_router(routes_people.router)
app.include_router(routes_screenings.router)
app.include_router(routes_admin.router)

CENTRES = [("PHC-001", "Kolar Rural PHC", "Kolar"), ("PHC-002", "Mulbagal PHC", "Kolar")]
STAFF = [  # username, role, name, centre
    ("nurse1", "nurse", "Nurse Anita", "PHC-001"), ("nurse2", "nurse", "Nurse Priya", "PHC-001"),
    ("doctor1", "doctor", "Dr. Rao", "PHC-001"),
    ("nurse3", "nurse", "Nurse Kavya", "PHC-002"), ("doctor2", "doctor", "Dr. Iyer", "PHC-002"),
    ("admin1", "admin", "Centre Admin, Kolar", "PHC-001"), ("admin2", "admin", "Centre Admin, Mulbagal", "PHC-002"),
]
DEMO_PATIENTS = [  # id, name, dob, gender, mobile, centre
    ("P001", "Meera Krishnan", "1971-03-14", "Female", "9876500001", "PHC-001"),
    ("P002", "Ravi Shankar", "1964-08-02", "Male", "9876500002", "PHC-001"),
    ("P003", "Lakshmi Narayan", "1958-11-23", "Female", "9876500003", "PHC-001"),
    ("P004", "Arjun Patil", "1975-01-09", "Male", "9876500004", "PHC-002"),
    ("P005", "Sunita Rao", "1969-06-30", "Female", "9876500005", "PHC-002"),
    ("P006", "Mohan Das", "1952-12-18", "Male", "9876500006", "PHC-002"),
]
MIGRATIONS = [
    "ALTER TABLE patients ADD COLUMN IF NOT EXISTS history VARCHAR(200) DEFAULT ''",
    "ALTER TABLE patients ADD COLUMN IF NOT EXISTS centre_id VARCHAR(12)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS centre_id VARCHAR(12)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change BOOLEAN DEFAULT FALSE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT now()",
    "ALTER TABLE screenings ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(40)",
]

def seed(db: Session):
    if db.query(M.User).count(): return
    for cid, name, district in CENTRES:
        db.merge(M.Centre(id=cid, name=name, district=district, active=True))
    db.flush()
    creds = []
    def make_user(username, role, name, centre, patient_id=None):
        tmp = auth.temp_password(); creds.append((username, role, centre, tmp))
        db.add(M.User(username=username, password_hash=auth.hash_pw(tmp), role=role, name=name,
                      patient_id=patient_id, centre_id=centre, must_change=True))
    for pid, name, dob, g, mob, centre in DEMO_PATIENTS:
        db.add(M.Patient(id=pid, name=name, dob=dob, gender=g, mobile=mob, verified=True, consent=True,
                         created_by="seed", centre_id=centre))
    db.flush()
    for pid, name, _, _, _, centre in DEMO_PATIENTS: make_user(pid, "patient", name, centre, pid)
    for username, role, name, centre in STAFF: make_user(username, role, name, centre)
    audit.log(db, "database_seeded"); db.commit()
    print("\n=== DEMO ACCOUNTS (temporary passwords, shown only now; each must be changed at first login) ===")
    for username, role, centre, tmp in creds: print(f"  {username:<8} {role:<8} {centre}   {tmp}")
    print("=" * 90 + "\n")

def run_migrations():
    """New database: build the tables and mark it up to date.
    Database from before migrations existed: apply the old fixes once and mark it as the baseline.
    Then apply any newer migration files."""
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    insp = inspect(M.engine)
    if not insp.has_table("alembic_version"):
        if insp.has_table("users"):
            M.Base.metadata.create_all(M.engine)                  # adds any table an old database lacks
            with M.engine.begin() as c:
                for sql in MIGRATIONS: c.execute(text(sql))
                c.execute(text("INSERT INTO centres (id, name, district, active) VALUES ('PHC-001', 'Kolar Rural PHC', 'Kolar', TRUE) ON CONFLICT (id) DO NOTHING"))
                c.execute(text("UPDATE users SET centre_id = 'PHC-001' WHERE centre_id IS NULL"))
                c.execute(text("UPDATE patients SET centre_id = 'PHC-001' WHERE centre_id IS NULL"))
            command.stamp(cfg, "0001")
        else:
            M.Base.metadata.create_all(M.engine)
            command.stamp(cfg, "head")
    command.upgrade(cfg, "head")

import secrets_check;
secrets_check.enforce()

@contextmanager
def startup_lock():
    """Only one worker at a time may migrate and seed. The others wait here, then find it already done."""
    with M.engine.connect() as c:
        c.execute(text("SELECT pg_advisory_lock(7)")); c.commit()
        try: yield
        finally:
            c.execute(text("SELECT pg_advisory_unlock(7)")); c.commit()

@app.on_event("startup")
def startup():
    storage.init(); 
    with startup_lock():
        run_migrations()           # keep your existing seed call exactly as it is
        with M.SessionLocal() as db: seed(db)

def db_ok():
    try:
        with M.engine.connect() as c: c.execute(text("select 1"))
        return True
    except Exception: return False

def storage_ok():
    try: storage.get("fundus", "__health__"); return True
    except Exception as e: return getattr(e, "code", "") in ("NoSuchKey", "NoSuchObject")   # "not found" means storage answered

def model_ok(): return bool(getattr(pipeline, "MODEL_VERSION", None))

_ready = {"t": 0.0, "v": None}

@app.get("/health", include_in_schema=False)
def health():                      # "is the process alive"
    return {"status": "ok"}

@app.get("/health/ready", include_in_schema=False)
def ready():                       # "can it actually do its job"
    if time.time() - _ready["t"] > 5 or _ready["v"] is None:      # cached 5 s so it cannot be used to hammer the database
        _ready.update(t=time.time(), v={"database": db_ok(), "storage": storage_ok(), "model": model_ok()})
    body = _ready["v"]; good = all(body.values())
    return JSONResponse({"status": "ok" if good else "degraded", **body}, status_code=200 if good else 503)

@app.get("/audit/verify")
def verify(db: Session = Depends(M.get_db), u=Depends(auth.require("doctor"))):
    return audit.verify(db)