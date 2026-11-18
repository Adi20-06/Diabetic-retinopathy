import sys, json, hashlib, uuid, datetime as dt, requests

B = "http://127.0.0.1:8000"
img1 = sys.argv[1]; img2 = sys.argv[2] if len(sys.argv) > 2 else img1
sha = lambda b: hashlib.sha256(b).hexdigest()

def login(u, p):
    r = requests.post(f"{B}/auth/login", json={"username": u, "password": p}); r.raise_for_status()
    return {"Authorization": "Bearer " + r.json()["token"]}

nurse, doctor, patient = login("nurse1", "nurse123"), login("doctor1", "doctor123"), login("P003", "patient123")
cid = str(uuid.uuid4())

def sync(send, with_files=True, tamper=False):
    eyes, files = {}, {}
    for eye, path in (("right", img1), ("left", img2)):
        b = open(path, "rb").read()
        claimed = sha(b + b"x") if tamper else sha(b)
        eyes[eye] = dict(state="completed", original_sha256=claimed, processing_sha256=claimed, capture_count=1)
        if with_files:
            files[f"{eye}_original"] = (f"{eye}.jpg", b, "image/jpeg")
            files[f"{eye}_processing"] = (f"{eye}.jpg", b, "image/jpeg")
    payload = dict(client_id=cid, patient_id="P003", created_at=dt.datetime.now(dt.timezone.utc).isoformat(), send_to_doctor=send, eyes=eyes)
    return requests.post(f"{B}/sync/screenings", headers=nurse, data={"payload": json.dumps(payload)}, files=files or None)

r = sync(False, tamper=True);  print("1 tampered upload      ->", r.status_code, r.json().get("detail"))
r = sync(False);               j = r.json(); sid = j["id"]
print("2 first sync           ->", r.status_code, sid, j["status"], "created =", j["created"])
r = sync(False);               j = r.json()
print("3 same record again    ->", r.status_code, sid == j["id"], "duplicate_eyes =", j["duplicate_eyes"])
print("4 nurse sees AI?       ->", "ai" in j["eyes"]["right"])
r = sync(True);                j = r.json()
print("5 send to doctor       ->", r.status_code, "ai_state =", j["ai_state"], "doctor_review =", j["doctor_review"])

d = requests.get(f"{B}/screenings/{sid}", headers=doctor).json()
ai = {e: d["eyes"][e]["ai"] for e in d["eyes"]}
print("6 doctor sees AI       ->", {e: (a["grade"], a["triage"]) for e, a in ai.items()}, "| priority:", d["priority"])
print("   heatmap url present ->", "heatmap_url" in d["eyes"]["right"])

grades = {e: (ai[e]["grade"] + 1) % 5 for e in ai}            # force an override
r = requests.post(f"{B}/screenings/{sid}/reviews", headers=doctor, json=dict(decision="routine_referral", final_grades=grades))
print("7 override, no reason  ->", r.status_code, r.json().get("detail"))
r = requests.post(f"{B}/screenings/{sid}/reviews", headers=doctor, json=dict(decision="routine_referral", final_grades=grades, notes="Exudates visible near macula"))
print("8 override + reason    ->", r.status_code, "overrides =", r.json()["reviews"][-1]["overrides"])
d2 = requests.get(f"{B}/screenings/{sid}", headers=doctor).json()
print("9 AI preserved         ->", {e: d2["eyes"][e]["ai"]["grade"] for e in ai} == {e: ai[e]["grade"] for e in ai})

r = requests.get(f"{B}/screenings/{sid}", headers=patient)
print("10 patient before release ->", r.status_code)
requests.post(f"{B}/screenings/{sid}/release", headers=doctor).raise_for_status()
r = requests.get(f"{B}/screenings/{sid}", headers=patient).json()
print("11 patient after release  ->", sorted(r.keys()), "| has probs:", "ai" in json.dumps(r))
print("12 analytics           ->", requests.get(f"{B}/analytics", headers=doctor).json())
print("13 audit chain         ->", requests.get(f"{B}/audit/verify", headers=doctor).json())