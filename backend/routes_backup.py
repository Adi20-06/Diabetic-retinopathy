import datetime as dt, json, os, subprocess, sys, threading, time
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import models as M, audit, auth
from logging_setup import log

router = APIRouter(tags=["backup"])
HERE = Path(__file__).resolve().parent
BACKUPS = Path(os.getenv("BACKUP_DIR", HERE / "backups"))
MIN_GAP, STALE = 120, 3600                       # seconds: no new backup within 2 min of the last; a lock older than 1 h is a crashed run

def _lock(): return BACKUPS / ".running"
def _last(): return BACKUPS / ".last.json"
def _iso(ts): return dt.datetime.fromtimestamp(ts, dt.timezone.utc).isoformat()
def _is_running():
    try: return time.time() - _lock().stat().st_mtime < STALE
    except FileNotFoundError: return False

def _take_lock() -> bool:
    """A lock file works across several API workers: only one process can create it."""
    BACKUPS.mkdir(parents=True, exist_ok=True)
    for _ in range(2):
        try:
            os.close(os.open(_lock(), os.O_CREAT | os.O_EXCL | os.O_WRONLY)); return True
        except FileExistsError:
            try:
                if time.time() - _lock().stat().st_mtime > STALE: _lock().unlink()
                else: return False
            except FileNotFoundError: pass
    return False

def _run(by: str):
    t0, ok, verified = time.time(), False, False
    try:
        a = subprocess.run([sys.executable, "backup.py", "run"], cwd=HERE, capture_output=True, text=True, timeout=3000)
        ok = a.returncode == 0
        if not ok: log.error("backup failed: " + (a.stderr or a.stdout)[-500:])
        if ok:                                     # prove the backup can really be restored
            b = subprocess.run([sys.executable, "backup.py", "verify"], cwd=HERE, capture_output=True, text=True, timeout=3000)
            verified = b.returncode == 0
            if not verified: log.error("backup verify failed: " + (b.stderr or b.stdout)[-500:])
    except Exception:
        log.exception("backup crashed")
    finally:
        try:
            _last().write_text(json.dumps(dict(by=by, at=time.time(), ok=ok, verified=verified, seconds=int(time.time() - t0))))
            with M.SessionLocal() as db:
                audit.log(db, "backup_finished", detail={"by": by, "ok": ok, "verified": verified}); db.commit()
        except Exception:
            log.exception("backup bookkeeping failed")
        _lock().unlink(missing_ok=True)

@router.post("/backup/run", status_code=202)
def start(db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    try: last = json.loads(_last().read_text())
    except Exception: last = None
    if last and time.time() - last["at"] < MIN_GAP:
        raise HTTPException(429, "A backup was made a moment ago. Try again in a minute or two.")
    if not _take_lock(): raise HTTPException(409, "A backup is already running.")
    try:
        audit.log(db, "backup_started", detail={"by": u.username}); db.commit()
    except Exception:
        _lock().unlink(missing_ok=True); raise
    threading.Thread(target=_run, args=(u.username,), daemon=True).start()
    return {"started": True}

@router.get("/backup/status")
def status(db: Session = Depends(M.get_db), u=Depends(auth.require("nurse"))):
    items = []
    if BACKUPS.exists():
        for p in BACKUPS.iterdir():
            m = p / "manifest.json"
            if p.is_dir() and m.exists():
                size = sum(f.stat().st_size for f in p.rglob("*") if f.is_file())
                items.append((m.stat().st_mtime, dict(name=p.name, at=_iso(m.stat().st_mtime), size_mb=round(size / 1e6, 1))))
    items.sort(key=lambda x: x[0], reverse=True)
    try:
        l = json.loads(_last().read_text()); who = db.get(M.User, l["by"])
        last = dict(at=_iso(l["at"]), ok=l["ok"], verified=l["verified"], seconds=l["seconds"], by=who.name if who else l["by"])
    except Exception:
        last = None
    return dict(running=_is_running(), last=last, backups=[x[1] for x in items[:14]])