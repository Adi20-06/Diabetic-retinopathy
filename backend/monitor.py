"""Watches the system and warns you.  Run from the backend folder:  python monitor.py
Alerts go to Telegram if TELEGRAM_TOKEN and TELEGRAM_CHAT are set, otherwise they are only printed."""
import json, os, shutil, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
import ctypes, json, os, shutil, sys, threading, time, urllib.error, urllib.parse, urllib.request

API = os.getenv("MONITOR_URL", "http://127.0.0.1:8000")
EVERY, FAILS = 60, 2                              # check each minute; alert after 2 failures in a row
MIN_FREE_GB, MAX_BACKUP_H = 5, 26
BACKUPS = Path(os.getenv("BACKUP_DIR", Path(__file__).resolve().parent / "backups"))
TOKEN, CHAT = os.getenv("TELEGRAM_TOKEN"), os.getenv("TELEGRAM_CHAT")

def popup(msg, good=False):
    if sys.platform != "win32": return
    def show():
        ctypes.windll.user32.MessageBeep(0x40 if good else 0x30)
        # 0x40000 always on top, 0x10000 foreground, 0x40 info icon / 0x30 warning icon
        ctypes.windll.user32.MessageBoxW(0, msg, "DR Triage monitor", 0x40000 | 0x10000 | (0x40 if good else 0x30))
    threading.Thread(target=show, daemon=True).start()

def alert(msg, good=False, show=True):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)
    if show: popup(msg, good)
    if TOKEN and CHAT:
        try:
            data = urllib.parse.urlencode({"chat_id": CHAT, "text": f"DR Triage: {msg}"}).encode()
            urllib.request.urlopen(f"https://api.telegram.org/bot{TOKEN}/sendMessage", data, timeout=10)
        except Exception as e:
            print("could not send the Telegram message:", e)

def check_api():
    try:
        urllib.request.urlopen(API + "/health/ready", timeout=10); return None
    except urllib.error.HTTPError as e:
        try: return "not ready: " + ", ".join(k for k, v in json.loads(e.read()).items() if v is False)
        except Exception: return f"HTTP {e.code}"
    except Exception as e:
        return f"unreachable ({e.__class__.__name__})"

def check_disk():
    free = shutil.disk_usage(Path(__file__).resolve().anchor or ".").free / 1e9
    return f"only {free:.1f} GB free" if free < MIN_FREE_GB else None

def check_backup():
    done = [p.stat().st_mtime for p in BACKUPS.glob("*") if (p / "manifest.json").exists()] if BACKUPS.exists() else []
    if not done: return "no backup found"
    age = (time.time() - max(done)) / 3600
    return f"newest backup is {age:.0f} hours old" if age > MAX_BACKUP_H else None

state: dict[str, list] = {}
def report(name, problem):
    s = state.setdefault(name, [0, False])
    if problem:
        s[0] += 1
        if s[0] >= FAILS and not s[1]: s[1] = True; alert(f"PROBLEM with {name}: {problem}")
    else:
        if s[1]: alert(f"RECOVERED: {name} is fine again", good=True)
        state[name] = [0, False]

def check_worker():
    try: d = json.loads((Path(__file__).resolve().parent / "logs" / "worker.json").read_text())
    except Exception: return "the AI worker has not started (no heartbeat file)"
    age = time.time() - d["t"]
    if age > 120: return f"the AI worker stopped ({age:.0f} s since its last heartbeat)"
    if d["oldest_wait_s"] > 300: return f"the AI queue is stuck: oldest case waiting {d['oldest_wait_s'] // 60} min"
    if d["failed"] > 0: return f"{d['failed']} case(s) failed AI processing and need a retry"
    return None

if __name__ == "__main__":
    alert("monitor started", show=False)
    while True:
        report("API", check_api()); report("disk", check_disk()); report("backup", check_backup())
        report("AI worker", check_worker()) 
        time.sleep(EVERY)

