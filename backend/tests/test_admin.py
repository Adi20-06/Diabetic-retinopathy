import pytest
from helpers import make_staff

def test_staff_usernames_are_unique(client, H):
    make_staff(client, H, "dup.nurse")
    r = client.post("/admin/staff", json={"username": "dup.nurse", "name": "Again", "role": "nurse"}, headers=H["admin1"])
    assert r.status_code == 409

@pytest.mark.parametrize("body", [
    {"username": "Bad Name!", "name": "X Y", "role": "nurse"},
    {"username": "ok.name", "name": "X Y", "role": "admin"},        # an admin cannot create admins
    {"username": "ok.name2", "name": "X Y", "role": "patient"},
])
def test_bad_staff_requests_are_rejected(client, H, body):
    assert client.post("/admin/staff", json=body, headers=H["admin1"]).status_code == 422

@pytest.mark.parametrize("who", ["nurse1", "doctor1"])
def test_staff_cannot_use_admin_endpoints(client, H, who):
    assert client.get("/admin/staff", headers=H[who]).status_code == 403

def test_admin_cannot_touch_another_centres_staff(client, H):
    assert client.post("/admin/staff/nurse3/reset-password", headers=H["admin1"]).status_code == 404
    assert client.post("/admin/staff/nurse3/active", json={"active": False}, headers=H["admin1"]).status_code == 404

def test_admin_sees_only_own_centre_staff(client, H):
    make_staff(client, H, "c2.only.nurse", by="admin2")
    names = [s["username"] for s in client.get("/admin/staff", headers=H["admin1"]).json()]
    assert "c2.only.nurse" not in names and "nurse1" in names

def test_admin_has_no_patient_data_access(client, H):
    assert client.get("/patients", headers=H["admin1"]).status_code == 403
    assert client.get("/screenings", headers=H["admin1"]).status_code == 403