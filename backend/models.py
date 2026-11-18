import datetime as dt
from sqlalchemy import (Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, Text,
                        UniqueConstraint, create_engine)
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from settings import DB_URL

engine = create_engine(DB_URL)
SessionLocal = sessionmaker(engine)
class Base(DeclarativeBase): pass
now = lambda: dt.datetime.now(dt.timezone.utc)

def get_db():
    with SessionLocal() as db: yield db

class User(Base):
    __tablename__ = "users"
    username = Column(String(40), primary_key=True)
    password_hash = Column(String(200), nullable=False)
    role = Column(String(10), nullable=False)               # nurse | doctor | patient
    name = Column(String(120), nullable=False)
    patient_id = Column(String(12), ForeignKey("patients.id"))   # set only for role=patient

class Patient(Base):
    __tablename__ = "patients"
    id = Column(String(12), primary_key=True)               # P001, P101 ...
    name = Column(String(120), nullable=False)
    dob = Column(String(10), nullable=False)
    gender = Column(String(10), nullable=False)
    mobile = Column(String(15), nullable=False)
    history = Column(String(200), default="")
    verified = Column(Boolean, default=False)
    consent = Column(Boolean, default=False)
    created_by = Column(String(40))
    created_at = Column(DateTime(timezone=True), default=now)

class Screening(Base):
    __tablename__ = "screenings"
    id = Column(String(20), primary_key=True)               # SCR-1001 ...
    client_id = Column(String(40), unique=True)             # id made on the nurse's device; blocks duplicate uploads
    patient_id = Column(String(12), ForeignKey("patients.id"), nullable=False)
    operator = Column(String(40))
    status = Column(String(20), default="in_progress")      # in_progress | recapture_required | completed
    failed_checks = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=now)       # when it was done on the device
    synced_at = Column(DateTime(timezone=True))
    sent_to_doctor = Column(DateTime(timezone=True))
    ai_state = Column(String(10))                           # queued | done
    doctor_review = Column(String(10))                      # pending | reviewed
    report_released = Column(DateTime(timezone=True))

class EyeRecord(Base):
    __tablename__ = "eye_records"
    __table_args__ = (UniqueConstraint("screening_id", "eye"),)
    id = Column(Integer, primary_key=True)
    screening_id = Column(String(20), ForeignKey("screenings.id"), nullable=False)
    eye = Column(String(5), nullable=False)                 # right | left
    state = Column(String(20))                              # captured | quality_failed | completed
    original_key = Column(String(80)); processing_key = Column(String(80)); heatmap_key = Column(String(80))
    original_sha256 = Column(String(64)); processing_sha256 = Column(String(64))
    capture_count = Column(Integer, default=1)
    quality = Column(JSON)                                  # server-side gate result
    client_quality = Column(JSON)                           # what the device measured (kept for comparison)
    ai = Column(JSON)                                       # original AI prediction, never edited
    model_version = Column(String(40))

class Review(Base):                                         # append-only review history
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True)
    screening_id = Column(String(20), ForeignKey("screenings.id"), nullable=False)
    by = Column(String(40)); decision = Column(String(20))
    final_grades = Column(JSON); overrides = Column(Boolean, default=False)
    notes = Column(Text); follow_up = Column(String(40))
    at = Column(DateTime(timezone=True), default=now)

class Appointment(Base):
    __tablename__ = "appointments"
    id = Column(String(12), primary_key=True)               # APT-1001
    patient_id = Column(String(12), ForeignKey("patients.id"), nullable=False)
    date = Column(String(10)); reason = Column(String(80))
    status = Column(String(12), default="requested")        # requested | cancelled
    created_at = Column(DateTime(timezone=True), default=now)

class Audit(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    ts = Column(String(40)); action = Column(String(40)); screening_id = Column(String(36))
    detail = Column(JSON); prev_hash = Column(String(64)); hash = Column(String(64))

def next_patient_id(db):
    nums = [int(pid[1:]) for (pid,) in db.query(Patient.id) if pid[1:].isdigit()]
    return f"P{max([100] + nums) + 1}"