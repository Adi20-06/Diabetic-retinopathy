import json, logging, sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOGDIR = Path(__file__).resolve().parent / "logs"
FIELDS = ("rid", "method", "path", "status", "ms", "user", "ip")
log = logging.getLogger("drtriage")

class JsonFormatter(logging.Formatter):
    def format(self, r):
        d = {"ts": self.formatTime(r, "%Y-%m-%dT%H:%M:%S%z"), "level": r.levelname, "msg": r.getMessage()}
        d.update({k: getattr(r, k) for k in FIELDS if hasattr(r, k)})
        if r.exc_info: d["exc"] = self.formatException(r.exc_info)
        return json.dumps(d, ensure_ascii=False)

def setup_logging():
    if log.handlers: return
    LOGDIR.mkdir(exist_ok=True)
    log.setLevel(logging.INFO); log.propagate = False
    fh = RotatingFileHandler(LOGDIR / "api.log", maxBytes=10_000_000, backupCount=10, encoding="utf-8")
    fh.setFormatter(JsonFormatter())
    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(fh); log.addHandler(ch)