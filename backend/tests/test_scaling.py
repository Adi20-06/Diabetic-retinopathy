import datetime as dt
import auth, models as M
from helpers import new_patient

def test_throttle_lives_in_the_database():
    for _ in range(5): auth.record_fail("user:zed")
    assert auth.blocked("user:zed", 5) > 0
    assert auth.blocked("user:someone-else", 5) == 0
    auth.clear_fails("user:zed")
    assert auth.blocked("user:zed", 5) == 0

def test_old_failures_expire():
    auth.record_fail("user:old")
    with M.SessionLocal() as db:
        db.query(M.LoginFail).filter_by(key="user:old").update({"at": M.now() - dt.timedelta(seconds=auth.WINDOW + 5)})
        db.commit()
    assert auth.blocked("user:old", 1) == 0

def test_lists_are_paged_with_a_total(client, H):
    for _ in range(3): new_patient(client, H["nurse1"])
    r = client.get("/patients?limit=2", headers=H["nurse1"])
    assert r.status_code == 200 and len(r.json()) == 2 and int(r.headers["X-Total-Count"]) >= 3
    assert len(client.get("/patients?limit=2&offset=2", headers=H["nurse1"]).json()) >= 1
    assert client.get("/patients?limit=0", headers=H["nurse1"]).status_code == 422
    assert client.get("/patients?limit=100000", headers=H["nurse1"]).status_code == 422