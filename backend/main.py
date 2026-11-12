import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import models as M, storage, audit, pipeline
from iqa import assess

app = FastAPI(title="DR Triage API")

@app.on_event("startup")
def startup():
    M.Base.metadata.create_all(M.engine); storage.init()

def get_db():
    with M.SessionLocal() as db: yield db

class PatientIn(BaseModel): code: str; name: str; age: int; sex: str
class ReviewIn(BaseModel): verdict: str; note: str = ""

def serialize(s):
    d = dict(screening_id=s.id, patient_id=s.patient_id, eye=s.eye, status=s.status,
             quality_reasons=s.quality_reasons, triage=s.triage, grade=s.grade, probs=s.probs,
             referable_prob=s.referable_prob, entropy=s.entropy, model_version=s.model_version,
             created_at=s.created_at.isoformat() if s.created_at else None,
             review=dict(verdict=s.review_verdict, note=s.review_note) if s.review_verdict else None,
             image_url=storage.url("fundus", s.image_key))
    if s.heatmap_key: d["heatmap_url"] = storage.url("heatmaps", s.heatmap_key)
    if s.status == "rejected_quality": d["message"] = "Image not gradable, please recapture"
    return d

@app.post("/patients")
def add_patient(p: PatientIn, db: Session = Depends(get_db)):
    if db.query(M.Patient).filter_by(code=p.code).first(): raise HTTPException(409, "patient code exists")
    row = M.Patient(**p.model_dump()); db.add(row); db.flush()
    audit.log(db, "patient_registered", detail={"patient_id": row.id}); db.commit()
    return {"id": row.id, **p.model_dump()}

@app.post("/screenings")
def screen(patient_id: int = Form(...), eye: str = Form(...), file: UploadFile = File(...),
           db: Session = Depends(get_db)):
    if eye not in ("left", "right"): raise HTTPException(422, "eye must be left or right")
    if not db.get(M.Patient, patient_id): raise HTTPException(404, "patient not found")
    raw = file.file.read()
    try: img = pipeline.preprocess_512(raw)
    except ValueError: raise HTTPException(422, "file is not a readable image")
    sid = str(uuid.uuid4())
    storage.put("fundus", f"{sid}.jpg", raw)
    q = assess(img)
    s = M.Screening(id=sid, patient_id=patient_id, eye=eye, model_version=pipeline.MODEL_VERSION,
                    image_key=f"{sid}.jpg", quality_reasons=q["reasons"])
    if not q["gradable"]:
        s.status = "rejected_quality"
    else:
        r, x = pipeline.predict(img)
        storage.put("heatmaps", f"{sid}.jpg", pipeline.heatmap(img, x, r["grade"]))
        s.heatmap_key, s.status = f"{sid}.jpg", "completed"
        s.triage, s.grade, s.probs = r["triage"], r["grade"], r["probs"]
        s.referable_prob, s.entropy = r["referable_prob"], r["entropy"]
    db.add(s); db.flush()
    audit.log(db, "screening_created", sid, {"status": s.status, "triage": s.triage or "", "model": s.model_version})
    db.commit()
    return serialize(s)

@app.get("/screenings/{sid}")
def get_screening(sid: str, db: Session = Depends(get_db)):
    s = db.get(M.Screening, sid)
    if not s: raise HTTPException(404, "not found")
    return serialize(s)

@app.get("/patients/{pid}/screenings")
def patient_screenings(pid: int, db: Session = Depends(get_db)):
    rows = db.query(M.Screening).filter_by(patient_id=pid).order_by(M.Screening.created_at.desc()).all()
    return [serialize(s) for s in rows]

@app.post("/screenings/{sid}/review")
def review(sid: str, r: ReviewIn, db: Session = Depends(get_db)):
    s = db.get(M.Screening, sid)
    if not s: raise HTTPException(404, "not found")
    s.review_verdict, s.review_note, s.reviewed_at = r.verdict, r.note, M.now()
    audit.log(db, "clinician_review", sid, {"verdict": r.verdict}); db.commit()
    return serialize(s)

@app.get("/audit/verify")
def verify(db: Session = Depends(get_db)): return audit.verify(db)