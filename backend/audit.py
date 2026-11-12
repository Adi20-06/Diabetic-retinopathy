import hashlib, json, datetime as dt
from models import Audit

def _h(prev, ts, action, sid, detail):
    return hashlib.sha256(json.dumps([prev, ts, action, sid, detail], sort_keys=True).encode()).hexdigest()

def log(db, action, sid=None, detail=None):
    last = db.query(Audit).order_by(Audit.id.desc()).first()
    prev = last.hash if last else "0" * 64
    ts, detail = dt.datetime.now(dt.timezone.utc).isoformat(), detail or {}
    db.add(Audit(ts=ts, action=action, screening_id=sid, detail=detail,
                 prev_hash=prev, hash=_h(prev, ts, action, sid, detail)))

def verify(db):
    prev = "0" * 64
    for r in db.query(Audit).order_by(Audit.id):
        if r.prev_hash != prev or r.hash != _h(prev, r.ts, r.action, r.screening_id, r.detail):
            return {"valid": False, "broken_at_id": r.id}
        prev = r.hash
    return {"valid": True}