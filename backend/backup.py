"""Backups for DR Triage. Run from the backend folder, with `docker compose up -d` running.
  python backup.py run                      make a backup now
  python backup.py verify                   check the newest backup and test-restore it into a throwaway database
  python backup.py list                     show all backups
  python backup.py restore <folder> --yes   REPLACE current data with a backup (stop the API first)
Set BACKUP_DIR to keep backups on another drive, for example BACKUP_DIR=E:\\dr-backups.
"""
import argparse, hashlib, json, os, shutil, subprocess, sys, datetime as dt
from pathlib import Path
from sqlalchemy.engine import make_url
from settings import DB_URL

DEST = Path(os.getenv("BACKUP_DIR", Path(__file__).resolve().parent / "backups"))
KEEP = int(os.getenv("BACKUP_KEEP", "14"))                  # how many daily backups to keep
STORAGE_PORT = os.getenv("STORAGE_PORT", "9000")
url = make_url(DB_URL)
PG = ["-e", f"PGPASSWORD={url.password}"]

def out(args): return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()
def sh(args, **kw): return subprocess.run(args, check=True, **kw)

def container(port):
    names = out(["docker", "ps", "--filter", f"publish={port}", "--format", "{{.Names}}"]).splitlines()
    if not names: sys.exit(f"No running container publishes port {port}. Start it with: docker compose up -d")
    return names[0]

def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()

def backups(): return sorted(p for p in DEST.glob("*") if (p / "manifest.json").exists()) if DEST.exists() else []

def run():
    d = DEST / dt.datetime.now().strftime("%Y-%m-%d_%H%M%S"); d.mkdir(parents=True)
    try:
        dbc, sc = container(url.port or 5432), container(STORAGE_PORT)
        print("1/3 database ...")
        with open(d / "database.dump", "wb") as f:
            sh(["docker", "exec", *PG, dbc, "pg_dump", "-U", url.username, "-d", url.database, "-Fc"], stdout=f)
        print("2/3 images ...")
        mounts = out(["docker", "inspect", sc, "--format", "{{range .Mounts}}{{.Destination}} {{end}}"]).split()
        for i, m in enumerate(mounts):
            sh(["docker", "run", "--rm", "--volumes-from", f"{sc}:ro", "-v", f"{d.as_posix()}:/out", "alpine",
                "tar", "czf", f"/out/images{i}.tar.gz", "-C", m, "."])
        print("3/3 checksums ...")
        files = {p.name: sha(p) for p in sorted(d.iterdir())}
        (d / "manifest.json").write_text(json.dumps({"created": d.name, "storage_container": sc, "mounts": mounts, "files": files}, indent=2))
    except BaseException:
        shutil.rmtree(d, ignore_errors=True); raise          # never leave a half-finished backup that looks real
    for old in backups()[:-KEEP]: shutil.rmtree(old, ignore_errors=True)
    print(f"Backup saved: {d}  ({sum(p.stat().st_size for p in d.iterdir()) / 1e6:.1f} MB)")

def check_files(d):
    man = json.loads((d / "manifest.json").read_text())
    bad = [n for n, h in man["files"].items() if not (d / n).exists() or sha(d / n) != h]
    if bad: sys.exit(f"CORRUPT backup, do not use: {bad}")
    return man

def verify():
    bl = backups()
    if not bl: sys.exit("No backups found")
    d = bl[-1]; man = check_files(d); print(f"Checksums OK for {d.name}")
    dbc, tmp = container(url.port or 5432), "dr_verify"
    sh(["docker", "exec", *PG, dbc, "dropdb", "-U", url.username, "--if-exists", tmp])
    sh(["docker", "exec", *PG, dbc, "createdb", "-U", url.username, tmp])
    try:
        with open(d / "database.dump", "rb") as f:
            subprocess.run(["docker", "exec", "-i", *PG, dbc, "pg_restore", "-U", url.username, "-d", tmp, "--no-owner"], stdin=f, check=True)
        q = "select (select count(*) from patients)||' patients, '||(select count(*) from screenings)||' screenings, '||(select count(*) from users)||' users'"
        print("Test restore OK:", out(["docker", "exec", *PG, dbc, "psql", "-U", url.username, "-d", tmp, "-tAc", q]))
    finally:
        sh(["docker", "exec", *PG, dbc, "dropdb", "-U", url.username, "--if-exists", tmp])
    for i, _ in enumerate(man["mounts"]):
        n = out(["docker", "run", "--rm", "-v", f"{d.as_posix()}:/out:ro", "alpine", "sh", "-c", f"tar tzf /out/images{i}.tar.gz | wc -l"])
        print(f"Image archive {i} OK: {n} files")
    print("BACKUP VERIFIED")

def restore(folder, yes):
    d = DEST / folder
    if not (d / "manifest.json").exists(): sys.exit("No such backup. See: python backup.py list")
    if not yes: sys.exit("This REPLACES all current data. Stop the API first, then run again with --yes")
    man = check_files(d)
    dbc, sc = container(url.port or 5432), container(STORAGE_PORT)
    sh(["docker", "stop", sc])
    with open(d / "database.dump", "rb") as f:
        subprocess.run(["docker", "exec", "-i", *PG, dbc, "pg_restore", "-U", url.username, "-d", url.database,
                        "--clean", "--if-exists", "--no-owner"], stdin=f)       # harmless warnings on a clean database are normal
    for i, m in enumerate(man["mounts"]):
        sh(["docker", "run", "--rm", "--volumes-from", sc, "-v", f"{d.as_posix()}:/out:ro", "alpine", "sh", "-c",
            f"find {m} -mindepth 1 -delete; tar xzf /out/images{i}.tar.gz -C {m}"])
    sh(["docker", "start", sc])
    print("Restored. Start the API again.")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("run", "verify", "list"): sub.add_parser(c)
    r = sub.add_parser("restore"); r.add_argument("folder"); r.add_argument("--yes", action="store_true")
    a = ap.parse_args()
    if a.cmd == "run": run()
    elif a.cmd == "verify": verify()
    elif a.cmd == "restore": restore(a.folder, a.yes)
    else:
        for p in backups(): print(p.name, f"{sum(f.stat().st_size for f in p.iterdir()) / 1e6:.1f} MB")