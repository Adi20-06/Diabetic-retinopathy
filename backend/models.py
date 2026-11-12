import datetime as dt
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from settings import DB_URL

engine = create_engine(DB_URL)
SessionLocal = sessionmaker(engine)
class Base(DeclarativeBase): pass
now = lambda: dt.datetime.now(dt.timezone.utc)

class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True)
    code = Column(String(40), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    age = Column(Integer); sex = Column(String(10))
    created_at = Column(DateTime(timezone=True), default=now)

class Screening(Base):
    __tablename__ = "screenings"
    id = Column(String(36), primary_key=True)          # screening ID (uuid)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    eye = Column(String(5)); status = Column(String(20))   # completed | rejected_quality
    quality_reasons = Column(JSON)
    triage = Column(String(20)); grade = Column(Integer)
    probs = Column(JSON); referable_prob = Column(Float); entropy = Column(Float)
    model_version = Column(String(40))
    image_key = Column(String(80)); heatmap_key = Column(String(80))
    review_verdict = Column(String(20)); review_note = Column(Text); reviewed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=now)

class Audit(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    ts = Column(String(40)); action = Column(String(40)); screening_id = Column(String(36))
    detail = Column(JSON); prev_hash = Column(String(64)); hash = Column(String(64))