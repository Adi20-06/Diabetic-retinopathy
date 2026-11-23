import datetime as dt
from sqlalchemy import (Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, Text,
                        UniqueConstraint, create_engine , Index)
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from settings import DB_URL
from sqlalchemy import text   # add to the existing sqlalchemy import

engine = create_engine(DB_URL, pool_size=10, max_overflow=10, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(engine)
class Base(DeclarativeBase): pass
now = lambda: dt.datetime.now(dt.timezone.utc)

def get_db():
    with SessionLocal() as db: yield db

class Centre(Base):
    __tablename__ = "centres"
    id = Column(String(12), primary_key=True)               # PHC-001
    name = Column(String(120), nullable=False)
    district = Column(String(80), default="")
    active = Column(Boolean, default=True)
    phone = Column(String(20), default="")

class User(Base):
    __tablename__ = "users"
    username = Column(String(40), primary_key=True)
    password_hash = Column(String(200), nullable=False)
    role = Column(String(10), nullable=False)               # nurse | doctor | patient
    name = Column(String(120), nullable=False)
    patient_id = Column(String(12), ForeignKey("patients.id"))
    centre_id = Column(String(12), ForeignKey("centres.id"))
    active = Column(Boolean, default=True)
    must_change = Column(Boolean, default=False)             # true while the password is a temporary one
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True))
    password_changed_at = Column(DateTime(timezone=True), default=now)

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
    consent_version = Column(String(10))
    consent_at = Column(DateTime(timezone=True))
    consent_by = Column(String(40))
    anonymized_at = Column(DateTime(timezone=True))
    centre_id = Column(String(12), ForeignKey("centres.id"))
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
    ai_attempts = Column(Integer, default=0)
    ai_error = Column(String(200))
    ai_started_at = Column(DateTime(timezone=True))
    ai_finished_at = Column(DateTime(timezone=True))
    ai_next_try = Column(DateTime(timezone=True))           # a retry waits until this time
    doctor_review = Column(String(10))                      # pending | reviewed
    report_released = Column(DateTime(timezone=True))
    assigned_to = Column(String(40))                        # doctor's username chosen by the nurse

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

class LoginFail(Base):
    __tablename__ = "login_fails"
    id = Column(Integer, primary_key=True)
    key = Column(String(120), nullable=False)             # "user:nurse1" or "ip:1.2.3.4"
    at = Column(DateTime(timezone=True), nullable=False, default=now)
    
def lock(db, key: int):
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": key})     # released at commit

def next_patient_id(db):
    lock(db, 1)
    nums = [int(pid[1:]) for (pid,) in db.query(Patient.id) if pid[1:].isdigit()]
    return f"P{max([100] + nums) + 1}"

Index("ix_screenings_patient", Screening.patient_id)
Index("ix_screenings_operator_created", Screening.operator, Screening.created_at.desc())
Index("ix_screenings_assigned", Screening.assigned_to, Screening.sent_to_doctor)
Index("ix_screenings_queue", Screening.ai_state, Screening.ai_next_try)        # the worker's "what's next" lookup
Index("ix_eyes_screening", EyeRecord.screening_id)
Index("ix_reviews_screening", Review.screening_id)
Index("ix_appts_patient", Appointment.patient_id)
Index("ix_patients_centre", Patient.centre_id)
Index("ix_users_centre", User.centre_id)
Index("ix_audit_screening", Audit.screening_id)
Index("ix_login_fails_key_at", LoginFail.key, LoginFail.at)
Index("ix_login_fails_at", LoginFail.at)