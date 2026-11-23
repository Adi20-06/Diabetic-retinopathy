import os, subprocess, sys
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent / ".env"
WEAK = {"changeme", "password", "secret", "admin", "minioadmin", "rustfsadmin", "postgres", "root",
        "dr_pass", "drpass", "test", "123456", "12345678", "qwerty"}
WORDS = ("SECRET", "PASS", "KEY", "TOKEN")

def read_env(path=ENV_FILE) -> dict:
    out = {}
    p = Path(path)
    if not p.exists(): return out
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip("\"'")
    return out

def problems(path=ENV_FILE) -> list[str]:
    bad = []
    for k, v in read_env(path).items():
        v = os.environ.get(k, v)                                   # a real environment variable wins over the file
        if not v or not any(w in k.upper() for w in WORDS): continue
        need = 32 if "JWT" in k.upper() else 8 if "ACCESS" in k.upper() else 12
        if v.lower() in WEAK or len(v) < need or len(set(v)) < 5:
            bad.append(f"{k}: too weak (use {need}+ random characters, never a common word)")
    return bad

def enforce():
    """Called at API startup. Production refuses to start; development only warns."""
    bad = problems()
    if not bad: return
    msg = "Weak or default secrets found:\n  " + "\n  ".join(bad)
    if os.getenv("ENV") == "production": raise SystemExit("Refusing to start in production.\n" + msg)
    print("WARNING (allowed in development):\n" + msg)

def git_checks() -> list[str]:
    out = []
    root = ENV_FILE.parent
    try:
        tracked = subprocess.run(["git", "ls-files", ".env"], cwd=root, capture_output=True, text=True).stdout.strip()
        if tracked: out.append(".env is TRACKED by git. Run: git rm --cached .env  (and rotate every secret in it)")
        ign = subprocess.run(["git", "check-ignore", ".env"], cwd=root, capture_output=True, text=True).stdout.strip()
        if not ign: out.append(".env is not in .gitignore")
    except Exception:
        pass
    return out

if __name__ == "__main__":
    issues = problems() + git_checks()
    print("\n".join(issues) if issues else "All secrets look strong and .env is not in git")
    sys.exit(1 if issues else 0)