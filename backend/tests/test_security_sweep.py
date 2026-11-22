import re
import pytest
from helpers import new_patient, patient_login

PUBLIC = {("/auth/login", "post")}

def test_every_endpoint_needs_a_valid_login(client):
    spec = client.get("/openapi.json").json()
    bad, checked = [], 0
    for path, ops in spec["paths"].items():
        for method in ops:
            if (path, method) in PUBLIC or method not in {"get", "post", "put", "delete", "patch"}: continue
            url = re.sub(r"\{[^}]+\}", "x", path)
            for label, headers in (("no token", {}), ("garbage token", {"Authorization": "Bearer nope"}), ("wrong scheme", {"Authorization": "Basic abc"})):
                checked += 1
                r = client.request(method.upper(), url, headers=headers)
                if r.status_code != 401: bad.append(f"{method.upper()} {path} [{label}] -> {r.status_code}")
    assert checked > 50 and not bad, "\n".join(bad)

@pytest.mark.parametrize("who,method,path", [
    ("nurse1", "GET", "/audit"), ("nurse1", "GET", "/analytics"), ("nurse1", "GET", "/audit/verify"),
    ("doctor1", "POST", "/patients"), ("doctor1", "POST", "/sync/screenings"),
    ("nurse1", "GET", "/admin/staff"), ("doctor1", "GET", "/admin/staff"),
    ("admin1", "GET", "/patients"), ("admin1", "GET", "/screenings"),
])
def test_wrong_role_is_forbidden(client, H, who, method, path):
    assert client.request(method, path, headers=H[who]).status_code == 403

def test_patients_cannot_use_staff_endpoints(client, H):
    ph = patient_login(client, new_patient(client, H["nurse1"]))
    for method, path in (("GET", "/patients"), ("GET", "/screenings"), ("GET", "/analytics"), ("GET", "/audit"), ("GET", "/doctors")):
        assert client.request(method, path, headers=ph).status_code == 403, path

def test_security_headers_and_request_id(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    for h in ("Cache-Control", "X-Content-Type-Options", "X-Frame-Options", "X-Request-ID"):
        assert h in r.headers, h
    assert r.headers["Cache-Control"] == "no-store"

def test_readiness_reveals_nothing_extra(client):
    r = client.get("/health/ready")
    assert r.status_code == 200 and set(r.json()) == {"status", "database", "storage", "model"}