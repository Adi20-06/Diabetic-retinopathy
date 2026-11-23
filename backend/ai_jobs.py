import json, datetime as dt
from sqlalchemy import or_, func
import models as M, storage, pipeline, audit
from settings import AI_MODE
from logging_setup import log

MAX_ATTEMPTS = 3
STALE_MIN = 10            # a job "running" this long is assumed to belong to a crashed worker

clean = lambda x: json.loads(json.dumps(x, default=lambda o: o.item() if hasattr(o, "item") else str(o)))

def process(db, s):
    """Run the model on every accepted, gradable eye of one screening, once."""
    for r in db.query(M.EyeRecord).filter_by(screening_id=s.id).all():
        if r.state != "completed" or r.ai: continue
        img = pipeline.preprocess_512(storage.get("fundus", r.original_key))
        out, x = pipeline.predict(img)
        hk = f"{s.id}/{r.eye}-{r.original_sha256[:12]}.jpg"
        storage.put("heatmaps", hk, pipeline.heatmap(img, x, out["grade"]))
        r.heatmap_key, r.model_version = hk, pipeline.MODEL_VERSION
        r.ai = clean({**out, "referable": out["referable_prob"] >= pipeline.CAL["ref_thr"], "uncertain": out["triage"] == "Uncertain"})

def after_send(db, s):
    """Called by the API when a case is sent to a doctor. In queue mode the job just waits for a worker."""
    if AI_MODE == "inline":
        process(db, s); s.ai_state, s.ai_finished_at = "done", M.now()

def claim(db):
    """Take one waiting job. SKIP LOCKED means two workers can never take the same one."""
    now = M.now()
    stale = now - dt.timedelta(minutes=STALE_MIN)
    s = (db.query(M.Screening)
           .filter(or_((M.Screening.ai_state == "queued") & or_(M.Screening.ai_next_try.is_(None), M.Screening.ai_next_try <= now),
                       (M.Screening.ai_state == "running") & (M.Screening.ai_started_at < stale)))
           .order_by(M.Screening.sent_to_doctor)
           .with_for_update(skip_locked=True).limit(1).first())
    if not s: return None
    s.ai_state, s.ai_started_at, s.ai_attempts = "running", now, (s.ai_attempts or 0) + 1
    sid = s.id
    db.commit()
    return sid

def run_one(session_factory) -> bool:
    """Do one job if there is one. Returns False when the queue is empty."""
    with session_factory() as db:
        sid = claim(db)
    if not sid: return False
    with session_factory() as db:
        s = db.get(M.Screening, sid)
        try:
            process(db, s)
            s.ai_state, s.ai_error, s.ai_finished_at = "done", None, M.now()
            audit.log(db, "ai_completed", sid, {"attempts": s.ai_attempts})
            db.commit()
            log.info(f"AI done {sid}")
        except Exception as e:
            db.rollback()
            s = db.get(M.Screening, sid)
            n, msg = (s.ai_attempts or 1), f"{type(e).__name__}: {e}"[:200]
            s.ai_error = msg
            if n >= MAX_ATTEMPTS:
                s.ai_state = "failed"; audit.log(db, "ai_failed", sid, {"error": msg})
            else:
                s.ai_state, s.ai_next_try = "queued", M.now() + dt.timedelta(seconds=30 * 2 ** (n - 1))   # 30 s, 60 s, ...
            db.commit()
            log.exception(f"AI error on {sid} (attempt {n})")
    return True

def stats(session_factory):
    with session_factory() as db:
        live = db.query(M.Screening).filter(M.Screening.ai_state.in_(("queued", "running")))
        oldest = live.with_entities(func.min(M.Screening.sent_to_doctor)).scalar()
        return dict(queued=live.count(), failed=db.query(M.Screening).filter_by(ai_state="failed").count(),
                    oldest_wait_s=int((M.now() - oldest).total_seconds()) if oldest else 0)