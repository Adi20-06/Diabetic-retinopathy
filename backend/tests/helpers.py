import hashlib, io, json, random, uuid, datetime as dt
import numpy as np
from PIL import Image

PW = "Test-pass-2026x"                      # every seeded account gets this password in the tests
sha = lambda b: hashlib.sha256(b).hexdigest()

def jpeg(size=64):
    buf = io.BytesIO()
    noise = np.random.default_rng().integers(0, 255, (size, size, 3), dtype=np.uint8)
    Image.fromarray(noise).save(buf, "JPEG", quality=95)
    return buf.getvalue()

def login(client, username, password=PW):
    r = client.post("/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}

def new_patient(client, headers, **over):
    body = dict(name=f"Test {uuid.uuid4().hex[:8]}", dob="1970-01-01", gender="Female",
                mobile="9" + str(random.randint(10**8, 10**9 - 1)), history="", id_verified=True, consent=True) | over
    r = client.post("/patients", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()                          # includes id and temp_password

def make_staff(client, H, username, role="nurse", by="admin1"):
    r = client.post("/admin/staff", json={"username": username, "name": "Test Staff", "role": role}, headers=H[by])
    assert r.status_code == 200, r.text
    return r.json()["temp_password"]

def staff_login(client, username, tmp, new="Kolar-Heron-52x"):
    """First sign-in: temporary password, then choose a real one. Returns working headers."""
    h = login(client, username, tmp)
    r = client.post("/auth/change-password", json={"old_password": tmp, "new_password": new}, headers=h)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}

def patient_login(client, p):
    return staff_login(client, p["id"], p["temp_password"], "Lotus-River-4821x")

def build(patient_id, eyes=("right", "left"), doctor=None, send=False, cid=None):
    files, per_eye = {}, {}
    for eye in eyes:
        ob, pb = jpeg(), jpeg()
        files[f"{eye}_original"] = (f"{eye}.jpg", ob, "image/jpeg")
        files[f"{eye}_processing"] = (f"{eye}-p.jpg", pb, "image/jpeg")
        per_eye[eye] = dict(state="completed", original_sha256=sha(ob), processing_sha256=sha(pb), capture_count=1, quality=None)
    payload = dict(client_id=cid or uuid.uuid4().hex, patient_id=patient_id,
                   created_at=dt.datetime.now(dt.timezone.utc).isoformat(), send_to_doctor=send, doctor=doctor, eyes=per_eye)
    return payload, files

def post_sync(client, headers, payload, files):
    return client.post("/sync/screenings", data={"payload": json.dumps(payload)}, files=files, headers=headers)