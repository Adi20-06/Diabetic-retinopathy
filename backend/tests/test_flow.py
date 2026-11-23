import json
from helpers import (new_patient, build, post_sync, make_staff, staff_login, patient_login, run_ai_jobs , sha)

def test_full_journey(client, H):
    p = new_patient(client, H["nurse1"])
    assert p["verified"] is True and p["temp_password"]
    docs = [d["username"] for d in client.get("/doctors", headers=H["nurse1"]).json()]
    assert "doctor1" in docs and "doctor2" not in docs                      # only doctors of her own centre

    payload, files = build(p["id"], send=True, doctor="doctor1")
    r = post_sync(client, H["nurse1"], payload, files)
    assert r.status_code == 200, r.text
    s = r.json(); sid = s["id"]
    assert s["status"] == "completed" and s["ai_state"] == "queued" and s["assigned_to"] == "doctor1"   # the upload returns before the AI runs
    assert "ai" not in s["eyes"]["right"]                                   # the nurse never sees the AI result
    early = dict(decision="follow_up", final_grades={"right": 2, "left": 2}, notes="x")
    assert client.post(f"/screenings/{sid}/reviews", json=early, headers=H["doctor1"]).status_code == 409   # AI not finished yet
    assert run_ai_jobs() >= 1                                   # the nurse never sees the AI result

    d = client.get(f"/screenings/{sid}", headers=H["doctor1"])
    assert d.status_code == 200 and d.json()["eyes"]["right"]["ai"]["grade"] == 2
    body = dict(decision="routine_referral", final_grades={"right": 1, "left": 2}, notes="", follow_up="Within 1 month")
    assert client.post(f"/screenings/{sid}/reviews", json=body, headers=H["doctor1"]).status_code == 422   # override needs a reason
    body["notes"] = "Mild changes only"
    assert client.post(f"/screenings/{sid}/reviews", json=body, headers=H["doctor1"]).status_code == 200

    ph = patient_login(client, p)
    assert client.get(f"/screenings/{sid}", headers=ph).status_code == 403   # not released yet
    assert client.post(f"/screenings/{sid}/release", headers=H["doctor1"]).status_code == 200
    rep = client.get(f"/screenings/{sid}", headers=ph).json()
    assert rep["stage"] == "report_ready" and rep["eyes"]["right"]["heatmap_url"]
    text = json.dumps(rep)
    assert "probs" not in text and "referable_prob" not in text             # a patient never gets probabilities

    other = new_patient(client, H["nurse1"])
    assert client.get(f"/screenings/{sid}", headers=patient_login(client, other)).status_code == 403
    assert client.get("/audit/verify", headers=H["doctor1"]).status_code == 200

def test_syncing_twice_does_not_duplicate(client, H):
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"])
    a = post_sync(client, H["nurse1"], payload, files).json()
    b = post_sync(client, H["nurse1"], payload, files).json()
    assert a["id"] == b["id"] and b["created"] is False and set(b["duplicate_eyes"]) == {"right", "left"}

def test_corrupted_upload_is_refused(client, H):
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], eyes=("right",))
    payload["eyes"]["right"]["original_sha256"] = "0" * 64
    assert post_sync(client, H["nurse1"], payload, files).status_code == 422

def test_non_image_and_oversized_files_are_refused(client, H):
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], eyes=("right",))
    junk = b"this is not an image"
    files["right_original"] = ("x.jpg", junk, "image/jpeg"); payload["eyes"]["right"]["original_sha256"] = sha(junk)
    assert post_sync(client, H["nurse1"], payload, files).status_code == 422
    payload, files = build(p["id"], eyes=("right",))
    big = b"\0" * (21 * 1024 * 1024)
    files["right_original"] = ("x.jpg", big, "image/jpeg"); payload["eyes"]["right"]["original_sha256"] = sha(big)
    assert post_sync(client, H["nurse1"], payload, files).status_code == 413

def test_ungradable_photo_never_reaches_the_ai(client, H, monkeypatch):
    import routes_screenings as RS
    monkeypatch.setattr(RS, "assess", lambda img: {"gradable": False, "reasons": ["Image is blurry"], "score": 10})
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], send=True, doctor="doctor1")
    s = post_sync(client, H["nurse1"], payload, files).json()
    assert s["status"] == "recapture_required" and s["sent_to_doctor"] is None
    assert s["ai_state"] is None and s["send_rejected"]

def test_heavy_compression_is_caught_by_the_server(client, H, monkeypatch):
    import jpegq
    monkeypatch.setattr(jpegq, "estimate_quality", lambda b: 50.0)
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], eyes=("right",))
    s = post_sync(client, H["nurse1"], payload, files).json()
    assert s["status"] == "recapture_required"
    assert any("compress" in r.lower() for r in s["eyes"]["right"]["quality"]["reasons"])

def test_cannot_send_to_a_doctor_of_another_centre(client, H):
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], send=True, doctor="doctor2")
    s = post_sync(client, H["nurse1"], payload, files).json()
    assert s["sent_to_doctor"] is None and "doctor" in s["send_rejected"].lower()

def test_nurse_can_change_doctor_until_the_review_is_done(client, H):
    tmp = make_staff(client, H, "second.doctor", role="doctor")
    doc2 = staff_login(client, "second.doctor", tmp)
    p = new_patient(client, H["nurse1"])
    payload, files = build(p["id"], send=True, doctor="doctor1")
    sid = post_sync(client, H["nurse1"], payload, files).json()["id"]
    run_ai_jobs()
    assert client.get(f"/screenings/{sid}", headers=doc2).status_code == 404

    assert client.post(f"/screenings/{sid}/assign", json={"doctor": "doctor2"}, headers=H["nurse1"]).status_code == 422   # other centre
    assert client.post(f"/screenings/{sid}/assign", json={"doctor": "second.doctor"}, headers=H["nurse1"]).status_code == 200
    assert client.get(f"/screenings/{sid}", headers=doc2).status_code == 200
    assert client.get(f"/screenings/{sid}", headers=H["doctor1"]).status_code == 404
    assert sid not in [x["id"] for x in client.get(f"/patients/{p['id']}/screenings", headers=H["doctor1"]).json()]
    assert client.post(f"/screenings/{sid}/reviews", json=dict(decision="follow_up", final_grades={"right": 2, "left": 2}, notes="ok"),
                       headers=H["doctor1"]).status_code in (403, 404)
    assert client.post(f"/screenings/{sid}/reviews", json=dict(decision="follow_up", final_grades={"right": 2, "left": 2}, notes="ok"),
                       headers=doc2).status_code == 200
    assert client.post(f"/screenings/{sid}/assign", json={"doctor": "doctor1"}, headers=H["nurse1"]).status_code == 409