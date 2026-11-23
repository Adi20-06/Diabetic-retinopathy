import uuid
from helpers import new_patient, build, post_sync, patient_login

def test_search_shows_only_own_centre(client, H):
    name = f"Zebra {uuid.uuid4().hex[:8]}"
    p = new_patient(client, H["nurse1"], name=name)
    mine = client.get("/patients", params={"q": name}, headers=H["nurse1"]).json()
    other = client.get("/patients", params={"q": name}, headers=H["nurse3"]).json()
    assert [x["id"] for x in mine] == [p["id"]] and other == []

def test_other_centre_gets_not_found_everywhere(client, H):
    p = new_patient(client, H["nurse1"])
    assert client.get(f"/patients/{p['id']}", headers=H["nurse3"]).status_code == 404
    assert client.post(f"/patients/{p['id']}/verify", headers=H["nurse3"]).status_code == 404
    assert client.post(f"/patients/{p['id']}/reset-password", headers=H["nurse3"]).status_code == 404
    assert client.get(f"/patients/{p['id']}/screenings", headers=H["nurse3"]).status_code == 404
    payload, files = build(p["id"])
    assert post_sync(client, H["nurse3"], payload, files).status_code == 404

def test_reusing_a_client_id_cannot_overwrite_another_centres_record(client, H):
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"])
    assert post_sync(client, H["nurse1"], payload, files).status_code == 200
    evil, evil_files = build("P004", cid=payload["client_id"])       # P004 belongs to centre 2
    assert post_sync(client, H["nurse3"], evil, evil_files).status_code == 409

def test_doctor_of_another_centre_sees_nothing(client, H):
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], send=True, doctor="doctor1")
    sid = post_sync(client, H["nurse1"], payload, files).json()["id"]
    assert client.get(f"/screenings/{sid}", headers=H["doctor2"]).status_code == 404
    assert sid not in [s["id"] for s in client.get("/screenings", headers=H["doctor2"]).json()]

def test_appointments_stay_inside_the_centre(client, H):
    p = new_patient(client, H["nurse1"])
    ph = patient_login(client, p)
    a = client.post("/appointments", json={"date": "2026-12-01", "reason": "Follow-up"}, headers=ph)
    assert a.status_code == 200
    aid = a.json()["id"]
    assert aid in [x["id"] for x in client.get("/appointments", headers=H["nurse1"]).json()]
    assert aid not in [x["id"] for x in client.get("/appointments", headers=H["nurse3"]).json()]
    assert client.post(f"/appointments/{aid}/confirm", headers=H["nurse3"]).status_code == 404
    assert client.post(f"/appointments/{aid}/confirm", headers=H["nurse1"]).status_code == 200

def test_other_centre_doctor_cannot_review_or_release(client, H):
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], send=True, doctor="doctor1")
    sid = post_sync(client, H["nurse1"], payload, files).json()["id"]
    body = dict(decision="follow_up", final_grades={"right": 2, "left": 2}, notes="x")
    assert client.post(f"/screenings/{sid}/reviews", json=body, headers=H["doctor2"]).status_code == 404
    assert client.post(f"/screenings/{sid}/release", headers=H["doctor2"]).status_code == 404

def test_doctor_sees_only_own_patients_and_own_readable_audit(client, H):
    sent, unsent = new_patient(client, H["nurse1"]), new_patient(client, H["nurse1"])
    payload, files = build(sent["id"], send=True, doctor="doctor1")
    sid = post_sync(client, H["nurse1"], payload, files).json()["id"]
    ids = {x["id"] for x in client.get("/patients", headers=H["doctor1"]).json()}
    assert sent["id"] in ids and unsent["id"] not in ids
    assert client.get(f"/patients/{unsent['id']}", headers=H["doctor1"]).status_code == 404
    mine = client.get("/audit", headers=H["doctor1"]).json()
    assert all(isinstance(x["detail"], str) and "hash" not in x for x in mine)
    other = client.get("/audit", headers=H["doctor2"]).json()
    assert not any(sid in x["detail"] for x in other)