import sys, io, json, hashlib, uuid, datetime as dt, requests
from PIL import Image

B = "http://127.0.0.1:8000"
src = sys.argv[1]
r = requests.post(f"{B}/auth/login", json={"username": "nurse1", "password": "nurse123"})
H = {"Authorization": "Bearer " + r.json()["token"]}

for q in (92, 85, 80, 75, 40):
    b = io.BytesIO(); Image.open(src).convert("RGB").save(b, "JPEG", quality=q); raw = b.getvalue()
    h = hashlib.sha256(raw).hexdigest()
    payload = dict(client_id=str(uuid.uuid4()), patient_id="P003", created_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                   send_to_doctor=False, eyes={"right": dict(state="completed", original_sha256=h, processing_sha256=h)})
    files = {"right_original": ("r.jpg", raw, "image/jpeg"), "right_processing": ("r.jpg", raw, "image/jpeg")}
    j = requests.post(f"{B}/sync/screenings", headers=H, data={"payload": json.dumps(payload)}, files=files).json()
    e = j["eyes"]["right"]
    print(f"saved at q{q}: eye state = {e['state']}, estimated quality = {e['quality'].get('jpeg_quality')}, reasons = {e['quality']['reasons']}")