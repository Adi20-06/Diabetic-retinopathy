from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
import models as M, storage, audit, auth
import routes_auth, routes_people
import routes_auth, routes_people, routes_screenings
from settings import CORS_ORIGINS

app = FastAPI(title="DR Triage API")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(routes_auth.router)
app.include_router(routes_people.router)
app.include_router(routes_screenings.router)

DEMO_PATIENTS = [
    ("P001", "Meera Krishnan", "1971-03-14", "Female", "9876500001"),
    ("P002", "Ravi Shankar", "1964-08-02", "Male", "9876500002"),
    ("P003", "Lakshmi Narayan", "1958-11-23", "Female", "9876500003"),
    ("P004", "Arjun Patil", "1975-01-09", "Male", "9876500004"),
    ("P005", "Sunita Rao", "1969-06-30", "Female", "9876500005"),
    ("P006", "Mohan Das", "1952-12-18", "Male", "9876500006"),
]

def seed(db: Session):
    if db.query(M.User).count(): return
    for pid, name, dob, g, mob in DEMO_PATIENTS:
        db.add(M.Patient(id=pid, name=name, dob=dob, gender=g, mobile=mob, verified=True, consent=True, created_by="seed"))
    db.flush()
    for pid, name, *_ in DEMO_PATIENTS:
        db.add(M.User(username=pid, password_hash=auth.hash_pw("patient123"), role="patient", name=name, patient_id=pid))
    db.add(M.User(username="nurse1", password_hash=auth.hash_pw("nurse123"), role="nurse", name="Nurse Anita"))
    db.add(M.User(username="doctor1", password_hash=auth.hash_pw("doctor123"), role="doctor", name="Dr. Rao"))
    audit.log(db, "database_seeded"); db.commit()

@app.on_event("startup")
def startup():
    M.Base.metadata.create_all(M.engine); storage.init()
    with M.engine.begin() as c:   # adds the column to your existing table without wiping data
        c.execute(text("ALTER TABLE patients ADD COLUMN IF NOT EXISTS history VARCHAR(200) DEFAULT ''"))
    with M.SessionLocal() as db: seed(db)

@app.get("/audit/verify")
def verify(db: Session = Depends(M.get_db), u=Depends(auth.require("doctor"))):
    return audit.verify(db)