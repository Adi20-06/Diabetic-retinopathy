import datetime as dt
import models as M
import ai_jobs
from helpers import new_patient, build, post_sync, run_ai_jobs

def send_case(client, H):
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], send=True, doctor="doctor1")
    return post_sync(client, H["nurse1"], payload, files).json()["id"]

def set_job(sid, **fields):
    with M.SessionLocal() as db:
        s = db.get(M.Screening, sid)
        for k, v in fields.items(): setattr(s, k, v)
        db.commit()

def test_upload_returns_first_and_the_worker_finishes_it(client, H):
    run_ai_jobs()
    sid = send_case(client, H)
    before = client.get(f"/screenings/{sid}", headers=H["doctor1"]).json()
    assert before["ai_state"] == "queued" and not before["eyes"]["right"].get("ai")
    assert run_ai_jobs() == 1
    after = client.get(f"/screenings/{sid}", headers=H["doctor1"]).json()
    assert after["ai_state"] == "done" and after["eyes"]["right"]["ai"]["grade"] == 2

def test_a_job_is_claimed_once_and_a_crashed_worker_is_recovered(client, H):
    run_ai_jobs()
    sid = send_case(client, H)
    with M.SessionLocal() as a, M.SessionLocal() as b:
        assert ai_jobs.claim(a) == sid
        assert ai_jobs.claim(b) is None                                      # nobody else can take it
    assert ai_jobs.run_one(M.SessionLocal) is False                          # still "running", not yet considered crashed
    set_job(sid, ai_started_at=M.now() - dt.timedelta(minutes=ai_jobs.STALE_MIN + 1))
    assert ai_jobs.run_one(M.SessionLocal) is True                           # recovered
    assert client.get(f"/screenings/{sid}", headers=H["doctor1"]).json()["ai_state"] == "done"

def test_failures_retry_then_give_up_then_can_be_retried(client, H, monkeypatch):
    import pipeline
    run_ai_jobs()
    good = pipeline.predict
    def boom(img): raise RuntimeError("model crashed")
    monkeypatch.setattr(pipeline, "predict", boom)
    sid = send_case(client, H)
    assert ai_jobs.run_one(M.SessionLocal) is True                           # attempt 1 fails
    assert client.get(f"/screenings/{sid}", headers=H["doctor1"]).json()["ai_state"] == "queued"
    assert ai_jobs.run_one(M.SessionLocal) is False                          # backing off: not tried again straight away
    for _ in range(2):
        set_job(sid, ai_next_try=None)
        assert ai_jobs.run_one(M.SessionLocal) is True
    got = client.get(f"/screenings/{sid}", headers=H["doctor1"]).json()
    assert got["ai_state"] == "failed" and "model crashed" in got["ai_error"]
    body = dict(decision="follow_up", final_grades={"right": 2, "left": 2}, notes="x")
    assert client.post(f"/screenings/{sid}/reviews", json=body, headers=H["doctor1"]).status_code == 409
    monkeypatch.setattr(pipeline, "predict", good)                           # the problem is fixed
    assert client.post(f"/screenings/{sid}/retry-ai", headers=H["doctor2"]).status_code == 404   # other centre cannot
    assert client.post(f"/screenings/{sid}/retry-ai", headers=H["doctor1"]).status_code == 200
    assert run_ai_jobs() == 1
    assert client.get(f"/screenings/{sid}", headers=H["doctor1"]).json()["ai_state"] == "done"