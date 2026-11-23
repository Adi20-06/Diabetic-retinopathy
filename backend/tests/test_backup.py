import time
import routes_backup as RB

class Done:
    returncode, stdout, stderr = 0, "ok", ""

def test_only_nurses_can_back_up_and_it_is_rate_limited(client, H, tmp_path, monkeypatch):
    monkeypatch.setattr(RB, "BACKUPS", tmp_path)
    monkeypatch.setattr(RB.subprocess, "run", lambda *a, **k: Done())      # do not really run backup.py in a test
    assert client.get("/backup/status").status_code == 401
    for who in ("doctor1", "doctor2"):
        assert client.get("/backup/status", headers=H[who]).status_code == 403
        assert client.post("/backup/run", headers=H[who]).status_code == 403
    assert client.post("/backup/run", headers=H["nurse1"]).status_code == 202
    for _ in range(100):
        s = client.get("/backup/status", headers=H["nurse1"]).json()
        if not s["running"]: break
        time.sleep(0.05)
    assert s["running"] is False and s["last"]["ok"] and s["last"]["verified"]
    assert client.post("/backup/run", headers=H["nurse1"]).status_code == 429