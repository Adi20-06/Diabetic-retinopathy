"""Admin tool. Run from the backend folder, with the database running.
  python manage.py add-centre PHC-003 "Bangarpet PHC" --district Kolar
  python manage.py add-staff nurse.divya nurse "Nurse Divya" --centre PHC-001
  python manage.py add-staff dr.mehta doctor "Dr. Mehta" --centre PHC-001
  python manage.py reset-password nurse.divya
  python manage.py deactivate nurse.divya
  python manage.py list
"""
import argparse, re, sys
import models as M, auth, audit

def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add-centre"); a.add_argument("id"); a.add_argument("name"); a.add_argument("--district", default="")
    a = sub.add_parser("add-staff"); a.add_argument("username"); a.add_argument("role", choices=["nurse", "doctor", "admin"])
    a.add_argument("name"); a.add_argument("--centre", required=True)
    for c in ("reset-password", "deactivate", "activate"): sub.add_parser(c).add_argument("username")
    sub.add_parser("list")
    sub.add_parser("reset-patient").add_argument("patient_id")
    args = ap.parse_args()
    with M.SessionLocal() as db:
        if args.cmd == "add-centre":
            if db.get(M.Centre, args.id): sys.exit("That centre ID already exists")
            db.add(M.Centre(id=args.id, name=args.name, district=args.district, active=True))
            audit.log(db, "centre_added", detail={"by": "admin-cli", "centre": args.id}); db.commit()
            print("Centre created:", args.id)
        elif args.cmd == "add-staff":
            if not re.fullmatch(r"[a-z0-9._-]{3,30}", args.username): sys.exit("Username: 3-30 chars, lowercase letters, digits . _ -")
            if db.get(M.User, args.username): sys.exit("That username already exists")
            if not db.get(M.Centre, args.centre): sys.exit("Unknown centre. Create it with add-centre first")
            tmp = auth.temp_password()
            db.add(M.User(username=args.username, password_hash=auth.hash_pw(tmp), role=args.role, name=args.name,
                          centre_id=args.centre, must_change=True))
            audit.log(db, "staff_added", detail={"by": "admin-cli", "username": args.username, "role": args.role}); db.commit()
            print(f"Created {args.role} '{args.username}' at {args.centre}\nTemporary password (shown once): {tmp}")
        elif args.cmd == "list":
            for u in db.query(M.User).filter(M.User.role != "patient").order_by(M.User.centre_id, M.User.username):
                print(f"{u.centre_id}  {u.username:<14} {u.role:<7} {u.name:<20} {'ACTIVE' if u.active is not False else 'DISABLED'}")
        elif args.cmd == "reset-patient":
            p = db.get(M.Patient, args.patient_id)
            if not p: sys.exit("No such patient")
            tmp = auth.temp_password()
            u = db.get(M.User, p.id)
            if u: u.password_hash, u.must_change, u.failed_attempts, u.locked_until, u.password_changed_at = auth.hash_pw(tmp), True, 0, None, M.now()
            else: db.add(M.User(username=p.id, password_hash=auth.hash_pw(tmp), role="patient", name=p.name, patient_id=p.id, centre_id=p.centre_id, must_change=True))
            audit.log(db, "password_reset", detail={"by": "admin-cli", "patient_id": p.id}); db.commit()
            print(f"Temporary password for {p.id} (shown once): {tmp}")
        else:
            u = db.get(M.User, args.username)
            if not u: sys.exit("No such user")
            if args.cmd == "reset-password":
                tmp = auth.temp_password()
                u.password_hash, u.must_change = auth.hash_pw(tmp), True
                u.failed_attempts, u.locked_until, u.password_changed_at = 0, None, M.now()
                print(f"New temporary password for {u.username} (shown once): {tmp}")
            else:
                u.active = args.cmd == "activate"; u.password_changed_at = M.now()   # also ends their open sessions
                print(f"{u.username} is now {'active' if u.active else 'disabled'}")
            audit.log(db, args.cmd.replace("-", "_"), detail={"by": "admin-cli", "username": u.username}); db.commit()

if __name__ == "__main__": main()