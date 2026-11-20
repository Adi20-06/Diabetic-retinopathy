from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
import models as M, storage, audit, auth
import routes_auth, routes_people
import routes_auth, routes_people, routes_screenings
from settings import CORS_ORIGINS
import routes_admin

app = FastAPI(title="DR Triage API")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
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

@app.on_event("startup")
def startup():
    M.Base.metadata.create_all(M.engine); storage.init()
    with M.engine.begin() as c:   # upgrades an existing database without wiping it
        for sql in MIGRATIONS: c.execute(text(sql))
        c.execute(text("INSERT INTO centres (id, name, district, active) VALUES ('PHC-001', 'Kolar Rural PHC', 'Kolar', TRUE) ON CONFLICT (id) DO NOTHING"))
        c.execute(text("UPDATE users SET centre_id = 'PHC-001' WHERE centre_id IS NULL"))
        c.execute(text("UPDATE patients SET centre_id = 'PHC-001' WHERE centre_id IS NULL"))
    with M.SessionLocal() as db: seed(db)

@app.get("/audit/verify")
def verify(db: Session = Depends(M.get_db), u=Depends(auth.require("doctor"))):
    return audit.verify(db)