"""Encrypt / decrypt backups.
   python secure_backup.py encrypt backups        (every unencrypted file under it becomes .enc, plaintext removed)
   python secure_backup.py decrypt backups/2026-11-22.../dump.enc
The password comes from BACKUP_PASSWORD (environment or .env) or is asked for."""
import getpass, hashlib, os, sys
from pathlib import Path
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

CHUNK, MAGIC = 1024 * 1024, b"DRBK1"

def key_from(pw: str, salt: bytes) -> bytes:
    return Scrypt(salt=salt, length=32, n=2 ** 15, r=8, p=1).derive(pw.encode())

def encrypt_file(src, dst, pw):
    salt, base = os.urandom(16), os.urandom(8)
    aes = AESGCM(key_from(pw, salt))
    with open(src, "rb") as f, open(dst, "wb") as o:
        o.write(MAGIC + salt + base)
        blk, i = f.read(CHUNK), 0
        while True:
            nxt = f.read(CHUNK)
            ct = aes.encrypt(base + i.to_bytes(4, "big"), blk, b"M" if nxt else b"L")      # "L" marks the last piece
            o.write(len(ct).to_bytes(4, "big") + ct)
            if not nxt: break
            blk, i = nxt, i + 1

def decrypt_file(src, dst, pw):
    with open(src, "rb") as f, open(dst, "wb") as o:
        head = f.read(len(MAGIC) + 24)
        if head[:len(MAGIC)] != MAGIC: raise ValueError("not an encrypted backup")
        aes = AESGCM(key_from(pw, head[5:21])); base = head[21:29]
        i, n = 0, f.read(4)
        while n:
            ct = f.read(int.from_bytes(n, "big"))
            nn = f.read(4)
            o.write(aes.decrypt(base + i.to_bytes(4, "big"), ct, b"M" if nn else b"L"))
            n, i = nn, i + 1

def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(CHUNK), b""): h.update(b)
    return h.hexdigest()

def password():
    pw = os.getenv("BACKUP_PASSWORD")
    if not pw:
        try:
            from secrets_check import read_env; pw = read_env().get("BACKUP_PASSWORD")
        except Exception: pass
    return pw or getpass.getpass("Backup password: ")

def main(argv):
    if len(argv) != 3 or argv[1] not in ("encrypt", "decrypt"): raise SystemExit(__doc__)
    mode, target, pw = argv[1], Path(argv[2]), password()
    files = [target] if target.is_file() else [p for p in target.rglob("*") if p.is_file()]
    for p in files:
        try:
            if mode == "encrypt":
                if p.suffix == ".enc" or p.name == "manifest.json": continue        # the manifest only holds hashes
                out = p.with_name(p.name + ".enc")
                encrypt_file(p, out, pw)
                tmp = out.with_name(out.name + ".chk"); decrypt_file(out, tmp, pw)
                ok = sha(tmp) == sha(p); tmp.unlink()
                if not ok: out.unlink(); raise SystemExit(f"verification failed for {p}, kept the original")
                p.unlink(); print("encrypted", p)
            else:
                if p.suffix != ".enc": continue
                out = p.with_suffix("")
                try: decrypt_file(p, out, pw)
                except InvalidTag: out.unlink(missing_ok=True); raise SystemExit("Wrong password, or the file is damaged")
                print("decrypted", out)
        except ValueError as e:
            print("skipped", p, e)

if __name__ == "__main__":
    main(sys.argv)