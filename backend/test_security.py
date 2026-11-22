"""Run with the API up:  python test_security.py   (needs: pip install requests)"""
import re, sys, requests
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
spec = requests.get(BASE + "/openapi.json").json()
PUBLIC = {("/auth/login", "post")}
bad = 0

def sweep(label, headers):
    global bad
    n = 0
    for path, ops in spec["paths"].items():
        for method in ops:
            if (path, method) in PUBLIC or method not in ("get", "post", "put", "delete", "patch"): continue
            r = requests.request(method, BASE + re.sub(r"\{[^}]+\}", "x", path), headers=headers)
            n += 1
            if r.status_code != 401:
                bad += 1; print(f"FAIL [{label}] {method.upper()} {path} -> {r.status_code} (expected 401)")
    print(f"{label}: {n} endpoints checked")

sweep("no token", {})
sweep("garbage token", {"Authorization": "Bearer not.a.token"})
sweep("wrong scheme", {"Authorization": "Basic abc"})

r = requests.get(BASE + "/me")
for h in ("Cache-Control", "X-Content-Type-Options", "X-Frame-Options"):
    if h not in r.headers: bad += 1; print("FAIL missing header", h)

codes = [requests.post(BASE + "/auth/login", json={"username": "no.such.user", "password": "x" * 12}).status_code for _ in range(7)]
print("7 bad logins for an unknown user ->", codes)
if codes[-1] != 423: bad += 1; print("FAIL unknown usernames are not throttled")

print("\nALL CHECKS PASSED" if not bad else f"\n{bad} PROBLEM(S) FOUND")