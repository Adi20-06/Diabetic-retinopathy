import hashlib, os
import pytest
import auth
from helpers import PW, login, make_staff

def test_missing_token_is_401(client):
    assert client.get("/me").status_code == 401

def test_wrong_password_and_unknown_user_look_identical(client):
    a = client.post("/auth/login", json={"username": "nurse1", "password": "wrong-pass-1"})
    b = client.post("/auth/login", json={"username": "nobody.here", "password": "wrong-pass-1"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()

def test_unknown_usernames_get_locked_out_like_real_ones(client):
    codes = [client.post("/auth/login", json={"username": "ghost.user", "password": "x" * 12}).status_code for _ in range(7)]
    assert codes == [401] * 5 + [423] * 2

def test_temporary_password_flow(client, H):
    tmp = make_staff(client, H, "flow.nurse")
    r = client.post("/auth/login", json={"username": "flow.nurse", "password": tmp})
    assert r.status_code == 200 and r.json()["must_change"] is True
    old = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/patients", headers=old).status_code == 403        # nothing opens until the password is changed
    assert client.get("/me", headers=old).status_code == 200
    body = lambda o, n: {"old_password": o, "new_password": n}
    assert client.post("/auth/change-password", json=body(tmp, "password12345"), headers=old).status_code == 422
    assert client.post("/auth/change-password", json=body("not-the-one-1", "Kolar-Heron-52x"), headers=old).status_code == 400
    ok = client.post("/auth/change-password", json=body(tmp, "Kolar-Heron-52x"), headers=old)
    assert ok.status_code == 200 and ok.json()["must_change"] is False
    assert client.get("/me", headers=old).status_code == 401              # the old token died
    new = {"Authorization": f"Bearer {ok.json()['token']}"}
    assert client.get("/patients", headers=new).status_code == 200
    assert client.post("/auth/login", json={"username": "flow.nurse", "password": tmp}).status_code == 401

def test_real_account_locks_and_admin_reset_unlocks(client, H):
    tmp = make_staff(client, H, "lock.nurse")
    for _ in range(5):
        assert client.post("/auth/login", json={"username": "lock.nurse", "password": "wrong-pass-9"}).status_code == 401
    assert client.post("/auth/login", json={"username": "lock.nurse", "password": tmp}).status_code == 423   # right password, still locked
    new = client.post("/admin/staff/lock.nurse/reset-password", headers=H["admin1"]).json()["temp_password"]
    assert client.post("/auth/login", json={"username": "lock.nurse", "password": new}).status_code == 200

def test_disabled_account_loses_its_session(client, H):
    tmp = make_staff(client, H, "off.nurse")
    h = login(client, "off.nurse", tmp)
    assert client.post("/admin/staff/off.nurse/active", json={"active": False}, headers=H["admin1"]).status_code == 200
    assert client.get("/me", headers=h).status_code == 401
    assert client.post("/auth/login", json={"username": "off.nurse", "password": tmp}).status_code == 401

def test_refresh_gives_a_working_token(client, H):
    r = client.post("/auth/refresh", headers=H["nurse1"])
    assert r.status_code == 200
    assert client.get("/me", headers={"Authorization": f"Bearer {r.json()['token']}"}).status_code == 200

@pytest.mark.parametrize("pw", ["short1a", "alllettersnodigits", "1234567890123", "password12345",
                                "Welcome2026!!", "aaaaaaaaaa11", "xnurse1x-9999"])
def test_weak_passwords_are_rejected(pw):
    assert auth.policy_error(pw, "nurse1") is not None

@pytest.mark.parametrize("pw", ["Kolar-Heron-52x", "tiger-Mango-7391"])
def test_good_passwords_are_accepted(pw):
    assert auth.policy_error(pw, "nurse1") is None

def test_new_password_must_differ_from_old():
    assert auth.policy_error("Kolar-Heron-52x", "u1", auth.hash_pw("Kolar-Heron-52x")) is not None

def test_old_hash_format_still_works_and_gets_upgraded():
    salt = os.urandom(16)
    legacy = salt.hex() + ":" + hashlib.pbkdf2_hmac("sha256", b"old-secret-1", salt, 200_000).hex()
    assert auth.check_pw("old-secret-1", legacy) and not auth.check_pw("wrong", legacy)
    assert auth.needs_rehash(legacy) and not auth.needs_rehash(auth.hash_pw("x"))