"""The AI worker. Run it next to the API, in its own terminal:   python worker.py
You can run several copies; they never take the same job."""
import json, signal, time
import models as M, storage, ai_jobs
from logging_setup import LOGDIR, log, setup_logging

stop = False
def _stop(*_):
    global stop; stop = True

def main():
    setup_logging(); storage.init()
    signal.signal(signal.SIGINT, _stop); signal.signal(signal.SIGTERM, _stop)
    log.info("AI worker started")
    beat = 0.0
    while not stop:
        try:
            worked = ai_jobs.run_one(M.SessionLocal)
            if time.time() - beat > 10:                       # heartbeat file, read by monitor.py
                (LOGDIR / "worker.json").write_text(json.dumps({"t": time.time(), **ai_jobs.stats(M.SessionLocal)}))
                beat = time.time()
        except Exception:
            log.exception("worker error"); worked = False; time.sleep(5)
        if not worked: time.sleep(2)
    log.info("AI worker stopped")

if __name__ == "__main__":
    main()