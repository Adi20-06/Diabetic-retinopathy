import os, sys, types
import numpy as np
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from helpers import PW

# ---- 1. Stand-ins for what GitHub does not have: the trained model and the image storage ----
pipeline = types.ModuleType("pipeline")
pipeline.MODEL_VERSION = "test-model"
pipeline.CAL = {"ref_thr": 0.09}
pipeline.preprocess_512 = lambda data: np.zeros((8, 8, 3), dtype=np.uint8)
pipeline.predict = lambda img: ({"grade": 2, "probs": [0.1, 0.1, 0.6, 0.1, 0.1], "referable_prob": 0.8,
                                 "entropy": 0.5, "triage": "Referable"}, None)
pipeline.heatmap = lambda img, x, grade: b"fake-heatmap"
sys.modules["pipeline"] = pipeline

class NoSuchKey(Exception): code = "NoSuchKey"
_objects: dict = {}
def _get(b, k):
    if (b, k) not in _objects: raise NoSuchKey()
    return _objects[(b, k)]
storage = types.ModuleType("storage")
storage.init = lambda: None
storage.put = lambda b, k, data, content_type="image/jpeg": _objects.__setitem__((b, k), data)
storage.get = _get
storage.url = lambda b, k: f"http://storage.test/{b}/{k}"
storage.remove = lambda b, k: _objects.pop((b, k), None)
sys.modules["storage"] = storage

# ---- 2. A throwaway database. Never anything but a database whose name ends in "test". ----
import settings
base = make_url(os.getenv("TEST_DB_URL") or settings.DB_URL)
if not os.getenv("TEST_DB_URL"): base = base.set(database="dr_test")
assert base.database.endswith("test"), "refusing to run tests on a database that is not a test database"

def _prepare():
    try:
        e = create_engine(base, isolation_level="AUTOCOMMIT"); e.connect().close()
    except Exception:
        admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
        with admin.connect() as c: c.execute(text(f'CREATE DATABASE "{base.database}"'))
        e = create_engine(base, isolation_level="AUTOCOMMIT")
    with e.connect() as c:
        c.execute(text("DROP SCHEMA public CASCADE")); c.execute(text("CREATE SCHEMA public"))
    e.dispose()

_prepare()
settings.DB_URL = base.render_as_string(hide_password=False)     # models.py reads this when it is first imported

# ---- 3. Fixtures ----
@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    import main, models as M, auth
    with TestClient(main.app) as c:                  # startup runs: tables, migrations stamp, demo accounts
        h = auth.hash_pw(PW)
        with M.SessionLocal() as db:                 # the demo accounts get a known password for the tests
            for u in db.query(M.User): u.password_hash, u.must_change = h, False
            db.commit()
        yield c

@pytest.fixture(scope="session")
def H(client):
    from helpers import login
    return {u: login(client, u) for u in ("nurse1", "nurse2", "nurse3", "doctor1", "doctor2", "admin1", "admin2")}

@pytest.fixture(autouse=True)
def fresh_throttle():
    import auth
    auth._fails.clear()
    yield

@pytest.fixture(autouse=True)
def stub_gate(monkeypatch):
    """The real quality gate and JPEG check are tested separately; here every photo is gradable unless a test says otherwise."""
    import routes_screenings as RS, jpegq
    monkeypatch.setattr(RS, "assess", lambda img: {"gradable": True, "reasons": [], "score": 90})
    monkeypatch.setattr(jpegq, "estimate_quality", lambda b: 95.0)