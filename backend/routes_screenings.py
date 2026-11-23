import json, hashlib, datetime as dt
from collections import Counter
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
import models as M, storage, audit, auth, pipeline
from iqa import assess
import jpegq
from io import BytesIO
from PIL import Image
from pydantic import BaseModel, Field
import ai_jobs
from paging import Page, cached

router = APIRouter(tags=["screenings"])
EYES = ("right", "left")
DECISIONS = {"urgent_referral", "routine_referral", "follow_up", "recapture"}
sha = lambda b: hashlib.sha256(b).hexdigest()
iso = lambda d: d.isoformat() if d else None
clean = lambda x: json.loads(json.dumps(x, default=lambda o: o.item() if hasattr(o, "item") else str(o)))

MAX_IMG, MAX_PIXELS = 20 * 1024 * 1024, 40_000_000
MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp", "BMP": "image/bmp"}

def read_limited(f, eye):
    data = f.file.read(MAX_IMG + 1)
    if len(data) > MAX_IMG: raise HTTPException(413, f"The {eye} eye image is larger than 20 MB")
    return data

def check_image(data: bytes, eye: str) -> str:
    """Header check only: real image, allowed type, sane size. The stored content type comes from the file, never from the client."""
    try:
        im = Image.open(BytesIO(data)); fmt, (w, h) = im.format, im.size
    except Exception:
        raise HTTPException(422, f"The {eye} eye file is not a readable image")
    if fmt not in MIME: raise HTTPException(422, f"The {eye} eye image must be JPEG or PNG")
    if w * h > MAX_PIXELS: raise HTTPException(422, f"The {eye} eye image is too large (max 40 megapixels)")
    return MIME[fmt]

class EyeIn(BaseModel):
    state: str = Field("captured", max_length=20)
    original_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    processing_sha256: str = Field(pattern=r"^([0-9a-f]{64})?$")
    capture_count: int = Field(1, ge=1, le=50)
    quality: dict | None = None
class SyncIn(BaseModel):
    client_id: str = Field(min_length=8, max_length=40); patient_id: str = Field(max_length=12); created_at: str = Field(max_length=40)
    send_to_doctor: bool = False
    doctor: str | None = Field(None, max_length=40)
    eyes: dict[str, EyeIn]
class ReviewIn(BaseModel):
    decision: str = Field(max_length=20); final_grades: dict[str, int]
    notes: str = Field("", max_length=2000); follow_up: str = Field("Within 1 month", max_length=40)

# ---------- helpers ----------
def eyes_of(db, sid): return db.query(M.EyeRecord).filter_by(screening_id=sid).all()
def reviews_of(db, sid): return db.query(M.Review).filter_by(screening_id=sid).order_by(M.Review.id).all()

def next_id(db):
    M.lock(db, 2)
    nums = [int(i[4:]) for (i,) in db.query(M.Screening.id) if i[4:].isdigit()]
    return f"SCR-{max([1000] + nums) + 1}"

def priority(recs):
    ai = [r.ai for r in recs if r.ai]
    if not ai: return "awaiting AI"
    if any(a["referable"] for a in ai): return "referable"
    if any(a["uncertain"] for a in ai): return "uncertain"
    return "non-referable"


def eye_json(r, role, full=True):
    d = dict(eye=r.eye, state=r.state, quality=r.quality, capture_count=r.capture_count)
    if full:
        d.update(client_quality=r.client_quality, original_sha256=r.original_sha256, processing_sha256=r.processing_sha256,
                 image_url=storage.url("fundus", r.processing_key))
    if role == "doctor":
        d["ai"], d["model_version"] = r.ai, r.model_version
        if full:
            d["original_url"] = storage.url("fundus", r.original_key)
            if r.heatmap_key: d["heatmap_url"] = storage.url("heatmaps", r.heatmap_key)
    return d

def review_json(v):
    return dict(by=v.by, decision=v.decision, final_grades=v.final_grades, overrides=bool(v.overrides),
                notes=v.notes, follow_up=v.follow_up, at=iso(v.at))

def staff_view(db, s, role, full=True):
    p, recs = db.get(M.Patient, s.patient_id), eyes_of(db, s.id)
    d = dict(id=s.id, client_id=s.client_id, patient_id=s.patient_id, patient_name=p.name if p else None,
             operator=s.operator, status=s.status, failed_checks=s.failed_checks, created_at=iso(s.created_at),
             synced_at=iso(s.synced_at), sent_to_doctor=iso(s.sent_to_doctor), ai_state=s.ai_state,
             doctor_review=s.doctor_review, report_released=iso(s.report_released),
             eyes={r.eye: eye_json(r, role, full) for r in recs})
    d["assigned_to"] = s.assigned_to
    a = db.get(M.User, s.assigned_to) if s.assigned_to else None
    d["assigned_name"] = a.name if a else None
    if role == "doctor":
        d["ai_error"] = s.ai_error
        d["priority"] = priority(recs)
        d["reviews"] = [review_json(v) for v in reviews_of(db, s.id)]
    return d

def patient_view(db, s):
    d = dict(id=s.id, created_at=iso(s.created_at), sent_at=iso(s.sent_to_doctor), released_at=iso(s.report_released),
             stage="report_ready" if s.report_released else ("with_doctor" if s.sent_to_doctor else "in_progress"))
    revs = reviews_of(db, s.id)
    if s.report_released and revs:
        v = revs[-1]
        d["report"] = dict(decision=v.decision, follow_up=v.follow_up, final_grades=v.final_grades, notes=v.notes, by=v.by, at=iso(v.at))
        d["eyes"] = {r.eye: dict(image_url=storage.url("fundus", r.processing_key),
                                 heatmap_url=storage.url("heatmaps", r.heatmap_key) if r.heatmap_key else None)
                     for r in eyes_of(db, s.id)}
    return d

def view_for(db, s, u, full=True):
    return patient_view(db, s) if u.role == "patient" else staff_view(db, s, u.role, full)

def pick_doctor(db, u, username):
    d = db.get(M.User, username) if username else None
    if not d or d.role != "doctor" or d.centre_id != u.centre_id or d.active is False: return None
    return d

# ---------- sync ----------
@router.post("/sync/screenings")
def sync(payload: str = Form(...),
         right_original: UploadFile | None = File(None), right_processing: UploadFile | None = File(None),
         left_original: UploadFile | None = File(None), left_processing: UploadFile | None = File(None),
         db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    try: p = SyncIn.model_validate_json(payload)
    except Exception as e: raise HTTPException(422, f"Bad payload: {e}")
    if not p.eyes or any(k not in EYES for k in p.eyes): raise HTTPException(422, "eyes must be right and/or left")
    patient = db.get(M.Patient, p.patient_id)
    if not patient or patient.centre_id != u.centre_id: raise HTTPException(404, "Patient not found")
    if not patient.verified: raise HTTPException(409, "Patient identity is not verified")
    files = {"right": (right_original, right_processing), "left": (left_original, left_processing)}

    s = db.query(M.Screening).filter_by(client_id=p.client_id).first()   # duplicate prevention
    if s and s.patient_id != p.patient_id: raise HTTPException(409, "This upload does not match the saved screening")
    created = s is None
    if created:
        try: made = dt.datetime.fromisoformat(p.created_at.replace("Z", "+00:00"))
        except ValueError: made = M.now()
        s = M.Screening(id=next_id(db), client_id=p.client_id, patient_id=p.patient_id, operator=u.username, created_at=made)
        db.add(s); db.flush()

    dup, changed = [], []
    for eye, e in p.eyes.items():
        rec = db.query(M.EyeRecord).filter_by(screening_id=s.id, eye=eye).first()
        if rec and rec.original_sha256 == e.original_sha256:             # same image already stored
            dup.append(eye)
            if not s.sent_to_doctor:
                good = bool(rec.quality and rec.quality.get("gradable"))
                rec.state = e.state if good else "quality_failed"
            continue
        if s.sent_to_doctor: raise HTTPException(409, "Already sent to the doctor; images can no longer change")
        orig, proc = files[eye]
        if not orig or not proc: raise HTTPException(422, f"Both image files are required for the {eye} eye")
        ob, pb = read_limited(orig, eye), read_limited(proc, eye)
        mime = check_image(ob, eye); check_image(pb, eye)
        if sha(ob) != e.original_sha256 or sha(pb) != e.processing_sha256:
            raise HTTPException(422, f"Checksum mismatch for the {eye} eye: the upload was corrupted, please retry")
        try: img = pipeline.preprocess_512(ob)
        except ValueError: raise HTTPException(422, f"The {eye} eye file is not a readable image")
        q = clean(assess(img))    
        jq = jpegq.estimate_quality(ob)               # judged on the ORIGINAL file the nurse uploaded
        q["jpeg_quality"] = jq
        if jq is not None and round(jq) < jpegq.MIN_QUALITY:
            q["reasons"] = list(q.get("reasons", [])) + ["Image is heavily compressed, capture or export at a higher JPEG quality"]
            q["gradable"] = False                                       # server-side gate decides
        base = f"{s.id}/{eye}-{e.original_sha256[:12]}"
        storage.put("fundus", base + "-original", ob, mime)
        storage.put("fundus", base + "-processing.jpg", pb, "image/jpeg")
        if rec is None:
            rec = M.EyeRecord(screening_id=s.id, eye=eye, capture_count=e.capture_count); db.add(rec)
        else:
            rec.capture_count = max(e.capture_count, (rec.capture_count or 1) + 1)
        rec.state = e.state if q["gradable"] else "quality_failed"
        rec.original_key, rec.processing_key = base + "-original", base + "-processing.jpg"
        rec.original_sha256, rec.processing_sha256 = e.original_sha256, e.processing_sha256
        rec.quality, rec.client_quality, rec.ai, rec.heatmap_key = q, e.quality, None, None
        if not q["gradable"]: s.failed_checks = (s.failed_checks or 0) + len(q.get("reasons", []))
        changed.append(eye)

    db.flush()
    recs = eyes_of(db, s.id)
    if any(r.state == "quality_failed" for r in recs): s.status = "recapture_required"
    elif recs and all(r.state == "completed" for r in recs): s.status = "completed"
    else: s.status = "in_progress"
    s.synced_at = M.now()

    send_rejected = None
    if p.send_to_doctor and not s.sent_to_doctor:
        doc = pick_doctor(db, u, p.doctor)
        if not doc:
            send_rejected = "Choose a doctor from your health centre"
        elif s.status == "completed":
            s.sent_to_doctor, s.doctor_review, s.ai_state, s.assigned_to = M.now(), "pending", "queued", doc.username
            ai_jobs.after_send(db, s)
        else:
            send_rejected = "Every screened eye needs an accepted, gradable image first"
    audit.log(db, "screening_synced", s.id, dict(by=u.username, created=created, new_images=changed, duplicate_images=dup,
              sha256={r.eye: r.original_sha256 for r in recs}, assigned_to=s.assigned_to , sent_to_doctor=bool(s.sent_to_doctor)))
    db.commit()
    out = staff_view(db, s, u.role)
    out.update(created=created, duplicate_eyes=dup, updated_eyes=changed, send_rejected=send_rejected)
    return out

# ---------- reading ----------
@router.get("/screenings")
def list_screenings(full: bool = False, db: Session = Depends(M.get_db), u=Depends(auth.require("nurse", "doctor")) , pg: Page = Depends()):
    qs = (db.query(M.Screening).join(M.Patient, M.Patient.id == M.Screening.patient_id)
            .filter(M.Patient.centre_id == u.centre_id))
    if u.role == "nurse": qs = qs.filter(M.Screening.operator == u.username)
    else: qs = qs.filter(M.Screening.sent_to_doctor.isnot(None), or_(M.Screening.assigned_to == u.username, M.Screening.assigned_to.is_(None)))
    return [staff_view(db, s, u.role, full=full) for s in pg.apply(qs.order_by(M.Screening.created_at.desc()))]

@router.get("/screenings/{sid}")
def get_screening(sid: str, db: Session = Depends(M.get_db), u=Depends(auth.current_user)):
    s = db.get(M.Screening, sid)
    if not s: raise HTTPException(404, "Screening not found")
    if u.role == "patient":
        if s.patient_id != u.patient_id or not s.report_released:
            raise HTTPException(403, "This report is not available to you")
    else:
        auth.ensure_centre(db, u, s.patient_id)                                    # staff: own centre only
        if u.role == "doctor" and s.assigned_to not in (None, u.username):         # doctors: only cases sent to them
            raise HTTPException(404, "Screening not found")
    return view_for(db, s, u)

@router.get("/patients/{pid}/screenings")
def patient_screenings(pid: str, db: Session = Depends(M.get_db), u=Depends(auth.current_user)):
    if u.role == "patient" and u.patient_id != pid: raise HTTPException(403, "Not your record")
    if u.role != "patient": auth.ensure_centre(db, u, pid)
    qs = db.query(M.Screening).filter_by(patient_id=pid)
    if u.role == "doctor": qs = qs.filter(or_(M.Screening.assigned_to == u.username, M.Screening.assigned_to.is_(None)))
    qs = qs.order_by(M.Screening.created_at.desc())
    return [view_for(db, s, u, full=False) for s in qs]

# ---------- doctor actions ----------
@router.post("/screenings/{sid}/reviews")
def add_review(sid: str, b: ReviewIn, db: Session = Depends(M.get_db), u=Depends(auth.require("doctor"))):
    s = db.get(M.Screening, sid)
    if not s or not s.sent_to_doctor: raise HTTPException(404, "Screening not found")
    auth.ensure_centre(db, u, s.patient_id)
    if s.assigned_to not in (None, u.username): raise HTTPException(403, "This case is assigned to another doctor")
    if s.ai_state != "done":
        raise HTTPException(409, "AI results are not ready yet" if s.ai_state in ("queued", "running") else "AI processing failed. Ask for a retry")
    if b.decision not in DECISIONS: raise HTTPException(422, "Unknown decision")
    recs = {r.eye: r for r in eyes_of(db, sid)}
    if set(b.final_grades) != set(recs) or any(not 0 <= g <= 4 for g in b.final_grades.values()):
        raise HTTPException(422, "Give a final grade (0 to 4) for every screened eye")
    overrides = any(recs[e].ai and recs[e].ai["grade"] != g for e, g in b.final_grades.items())
    if overrides and not b.notes.strip(): raise HTTPException(422, "You changed the AI grade: please write the reason in the notes")
    v = M.Review(screening_id=sid, by=u.username, decision=b.decision, final_grades=b.final_grades,
                 overrides=overrides, notes=b.notes.strip(), follow_up=b.follow_up)
    db.add(v)                      # append only; the AI result is never touched
    s.doctor_review, s.report_released = "reviewed", None   # a new decision must be released again
    audit.log(db, "doctor_review", sid, dict(by=u.username, decision=b.decision, overrides=overrides)); db.commit()
    return staff_view(db, s, u.role)

@router.post("/screenings/{sid}/release")
def release(sid: str, db: Session = Depends(M.get_db), u=Depends(auth.require("doctor"))):
    s = db.get(M.Screening, sid)
    if not s: raise HTTPException(404, "Screening not found")
    auth.ensure_centre(db, u, s.patient_id)
    if s.assigned_to not in (None, u.username): raise HTTPException(403, "This case is assigned to another doctor")
    if s.doctor_review != "reviewed": raise HTTPException(409, "Record a decision before releasing the report")
    s.report_released = M.now()
    audit.log(db, "report_released", sid, dict(by=u.username)); db.commit()
    return staff_view(db, s, u.role)

# ---------- analytics and audit ----------
@router.get("/analytics")
def analytics(db: Session = Depends(M.get_db), u=Depends(auth.require("doctor"))):
    return cached(f"analytics:{u.centre_id}", 60, lambda: _analytics(db, u))      # at most one heavy calculation a minute per centre

def _analytics(db, u):
    ss = (db.query(M.Screening).join(M.Patient, M.Patient.id == M.Screening.patient_id)
            .filter(M.Patient.centre_id == u.centre_id).all())
    ids = {s.id for s in ss}
    recs = [r for r in db.query(M.EyeRecord).all() if r.screening_id in ids]
    by = {}
    for r in recs: by.setdefault(r.screening_id, []).append(r)
    pri = Counter(priority(by.get(s.id, [])) for s in ss if s.ai_state == "done")
    last = {v.screening_id: v for v in db.query(M.Review).order_by(M.Review.id)}
    grades, agree, rev_eyes, fails = [0] * 5, 0, 0, Counter()
    for r in recs:
        if r.quality and not r.quality.get("gradable"):
            fails.update(r.quality.get("reasons", []))
        if not r.ai: continue
        grades[r.ai["grade"]] += 1
        v = last.get(r.screening_id)
        if v and r.eye in v.final_grades:
            rev_eyes += 1; agree += v.final_grades[r.eye] == r.ai["grade"]
    today = dt.datetime.now(dt.timezone.utc).date()
    per_day = {str(today - dt.timedelta(days=i)): 0 for i in range(6, -1, -1)}
    for s in ss:
        k = str(s.created_at.date()) if s.created_at else ""
        if k in per_day: per_day[k] += 1
    n_ai = sum(pri.values())
    return dict(total=len(ss), completed=sum(s.status == "completed" for s in ss),
                recapture_required=sum(s.status == "recapture_required" for s in ss),
                with_ai=n_ai, referable=pri["referable"], uncertain=pri["uncertain"], non_referable=pri["non-referable"],
                grade_distribution=grades, ai_doctor_agreement=(agree / rev_eyes) if rev_eyes else None,
                quality_failures=dict(fails), per_day=per_day)

@router.get("/audit")
def audit_list(limit: int = 300, db: Session = Depends(M.get_db), u=Depends(auth.require("doctor"))):
    staff = {x for (x,) in db.query(M.User.username).filter(M.User.centre_id == u.centre_id)}
    pats = {x for (x,) in db.query(M.Patient.id).filter(M.Patient.centre_id == u.centre_id)}
    scr = {x for (x,) in db.query(M.Screening.id).join(M.Patient, M.Patient.id == M.Screening.patient_id)
                         .filter(M.Patient.centre_id == u.centre_id)}
    def mine(r):
        d = r.detail or {}
        return r.screening_id in scr or d.get("by") in staff or d.get("username") in staff or d.get("patient_id") in pats
    rows = db.query(M.Audit).order_by(M.Audit.id.desc()).limit(2000).all()
    return [dict(id=r.id, ts=r.ts, action=r.action, screening_id=r.screening_id, detail=r.detail, hash=r.hash)
            for r in rows if mine(r)][:min(limit, 1000)]

class AssignIn(BaseModel): doctor: str

@router.post("/screenings/{sid}/assign")
def assign(sid: str, b: AssignIn, db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    s = db.get(M.Screening, sid)
    if not s: raise HTTPException(404, "Screening not found")
    auth.ensure_centre(db, u, s.patient_id)
    if not s.sent_to_doctor: raise HTTPException(409, "Send the case to a doctor first")
    if s.doctor_review == "reviewed": raise HTTPException(409, "The doctor has already reviewed this case")
    doc = pick_doctor(db, u, b.doctor)
    if not doc: raise HTTPException(422, "Choose a doctor from your health centre")
    s.assigned_to = doc.username
    audit.log(db, "doctor_assigned", sid, dict(by=u.username, doctor=doc.username)); db.commit()
    return staff_view(db, s, u.role)

@router.post("/screenings/{sid}/retry-ai")
def retry_ai(sid: str, db: Session = Depends(M.get_db), u=Depends(auth.require("doctor", "nurse"))):
    s = db.get(M.Screening, sid)
    if not s or not s.sent_to_doctor: raise HTTPException(404, "Screening not found")
    auth.ensure_centre(db, u, s.patient_id)
    if u.role == "doctor" and s.assigned_to not in (None, u.username): raise HTTPException(404, "Screening not found")
    if s.ai_state != "failed": raise HTTPException(409, "Only a failed AI job can be retried")
    s.ai_state, s.ai_attempts, s.ai_next_try, s.ai_error = "queued", 0, None, None
    audit.log(db, "ai_retry", sid, dict(by=u.username)); db.commit()
    return staff_view(db, s, u.role)