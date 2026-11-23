# Runbook: DR Triage Platform

What to do when something goes wrong, written for someone who is stressed and not a developer. Every section is: **how you notice → what to do → how to confirm it worked**. All commands run in the `backend` folder with the virtual environment active, unless stated.

**Golden rules**
1. Before anything risky (migration, restore, upgrade): `python backup.py run`.
2. Never edit the database by hand. Use `manage.py` or the admin portal.
3. Write down what you did and when. The audit log records the app's side; your notes cover yours.

---

## 0. The daily picture

| Thing | Normal state | Check |
|---|---|---|
| API | answers `http://127.0.0.1:8000/health` | open it in a browser: `{"status":"ok"}` |
| Ready | database, storage and model all fine | `http://127.0.0.1:8000/health/ready` shows no "degraded" |
| AI worker | its terminal prints `AI worker started` | a heartbeat is written to `backend/logs/worker.json` every 10 s |
| Backup | one new folder per night | `python backup.py list` |
| Monitor | running in the tray area, popup on problems | `python monitor.py check` |
| Logs | `backend/logs/api.log` (rotates itself) | see section 9 |

Start everything (three terminals): database and storage `docker compose up -d`; API `python -m uvicorn main:app`; worker `python worker.py`.

---

## 1. The API is down / the app says "cannot reach server"

**Notice:** `/health` does not load, or the monitor popup says the API stopped.
1. Is the API terminal still running? If it closed, start it again: `python -m uvicorn main:app`.
2. If it prints a Python error on start, read the **last 10 lines**. Common ones:
   - `Refusing to start in production. Weak or default secrets` → fix `.env` (section 8).
   - `connection refused` to port 5433 → the database is down (section 2).
   - `alembic` or migration error → section 5.
3. Open `/health/ready`. It names which part is unhealthy.

**Confirm:** `/health/ready` shows everything OK, and a nurse can log in.

**Nurses are not blocked.** The nurse app works offline. Screenings are stored on the device and upload by themselves when the server returns. Tell them to keep working.

---

## 2. The database or image storage is down

**Notice:** `/health/ready` says `database` or `storage` is down.
1. Is Docker Desktop running? Start it.
2. `docker compose ps`: both containers should be `running`. If not: `docker compose up -d`.
3. Still failing: `docker compose logs --tail 50` and read the last errors.
4. **Disk full** is the usual cause of a database that will not start. Free space (delete old unneeded files), then start again. Check where backups are stored, since they can fill the disk.

**Confirm:** `/health/ready` is green. Do not restore a backup for a service that is merely stopped.

---

## 3. AI results do not appear (cases stay "queued")

**Notice:** the doctor sees "AI results are not available yet" for more than a minute, or the monitor says "the AI worker stopped".
1. Is the worker terminal running? If not: `python worker.py`. Queued cases are processed on their own. Nothing is lost.
2. The worker prints `AI done SCR-...` for each case. If it prints errors, read them. Cases retry 3 times (after 30 s, then 60 s), then become **failed**.
3. For failed cases: once the cause is fixed (model file present, storage up), the doctor or nurse presses **Retry** on the case, or use the API `POST /screenings/{id}/retry-ai`.
4. A worker that crashed halfway: its job is picked up again after 10 minutes.
5. Urgent and no worker is possible: stop the API, set `AI_MODE=inline`, start it again. The API runs the AI itself, slower. Switch back later.

**Confirm:** `logs/worker.json` has a fresh time; the case shows results.

---

## 4. Backup and restore

**Make a backup now:** `python backup.py run` (seconds to minutes). **List:** `python backup.py list`. **Check the newest is restorable:** `python backup.py verify`. It restores into a throwaway database and must end with `BACKUP VERIFIED`.

Nightly backups are scheduled in Windows (Task Scheduler, tasks named "DR Backup"). If the monitor says the backup is old: run `python backup.py run` and check Task Scheduler for the failed task.

**Encrypted backups** (if you use `secure_backup.py`): run `python secure_backup.py decrypt backups\<folder>` first. The password is the one you stored outside the backup disk. A wrong password, or a damaged file, is reported and nothing is written.

### Restore (data was lost, corrupted, or a bad change was made)
> Restoring **replaces** current data with the backup's. Anything entered after the backup is lost. Decide that first.

1. Stop the API and the worker (Ctrl+C in their terminals).
2. Make a backup of the broken state anyway: `python backup.py run` (it may be useful for forensics).
3. `python backup.py list`, choose the folder.
4. `python backup.py restore <folder> --yes`
5. `python backup.py verify` is optional but quick; then start API and worker.
6. Tell nurses: screenings made on their devices after the backup time are still on the devices and upload again by themselves. Check `GET /audit/verify` says the chain is valid.

**Practice this once before review day.** An untested backup is a hope, not a backup.

---

## 5. Database changes (migrations) went wrong

**Before any model change:** `python backup.py run`.
- Create: `alembic revision --autogenerate -m "short description"`. **Open the new file in `migrations/versions/` and read it** (it should contain only what you changed).
- Apply: `alembic upgrade head` (starting the API also does this).
- Undo the last one: `alembic downgrade -1`. If the data already changed in a way that cannot be undone, restore the backup (section 4).
- Error "multiple heads": two migration files were created from the same parent. Tell the developer, or delete the newest file if it is unapplied and re-generate.
- With several API workers, only one migrates at startup. The others wait, then continue.

---

## 6. Someone cannot log in

| Message / situation | Meaning | Action |
|---|---|---|
| "Too many wrong attempts" | 5 wrong passwords: locked 10 minutes | wait, or reset the password (clears the lock) |
| Forgot password, **staff** | | Administrator: *Staff* → Reset password. Or `python manage.py reset-password <username>` |
| Forgot password, **patient** | | Nurse: *Verification* → Reset. Or `python manage.py reset-patient P001` |
| Account was disabled | an administrator turned it off | *Staff* → Enable, or `python manage.py activate <username>` |
| Signed out suddenly | idle for 15 minutes, password changed, or the account was disabled | log in again |
| "Not allowed" or wrong portal | wrong role | check with `python manage.py list` |
| Nobody can log in, including admin | | check `/health/ready`; then `python manage.py reset-password admin1` |

The temporary password is shown **once** on screen. Give it privately. The person must choose their own at first sign-in.

**Lost the only administrator:** `python manage.py add-staff --centre PHC-001 admin3 admin "Name"` creates another and prints its temporary password.

---

## 7. Suspected account or data breach

Act fast; write down times.
1. **Cut access:** disable the affected accounts (admin portal or `python manage.py deactivate <username>`). Their tokens die within the same minute.
2. **If the token key may have leaked:** set a new `JWT_SECRET` in `.env` and restart the API without `JWT_SECRET_OLD`. This signs **everyone** out.
3. Reset passwords of the affected people. Rotate any secret that was exposed (section 8).
4. **Preserve evidence:** make a backup (`python backup.py run`) and copy `backend/logs/` somewhere safe. Check the audit log in the doctor portal; `GET /audit/verify` tells you if records were tampered with.
5. **Report:** if personal data was exposed, the law requires informing the authority and the people affected (see `docs/COMPLIANCE.md`, DPDP section). Tell the guide and the centre's responsible person immediately.
6. **Erasure request from a patient:** `python manage.py anonymize-patient P001`. Their record and images are removed; the audit trail keeps the fact that it happened.

---

## 8. Secrets and keys

- Check: `python secrets_check.py`. It must say all secrets look strong and `.env` is not in git. In production the API refuses to start otherwise.
- Make a strong value: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
- **Rotate the token key without signing everyone out:** put the old value in `JWT_SECRET_OLD`, the new one in `JWT_SECRET`, restart. After 40 minutes remove `JWT_SECRET_OLD` and restart.
- Changed the database or storage password: change it in `.env` **and** in the service, then restart both.
- A secret was committed to git: treat it as public. Rotate it, then clean the git history.

---

## 9. Reading the logs

`backend/logs/api.log` has one JSON line per request: time, request id, method, path, status, milliseconds, user. Find a problem:
```
findstr /C:"\"status\": 500" logs\api.log
findstr /C:"nurse1" logs\api.log
```
- Many `401` from one `ip`: someone guessing passwords (they are being throttled).
- `500`: a bug. Copy the line and the traceback below it.
- Slow requests: look at the `ms` value.

The audit log (doctor portal) is a different thing: it records *who did what to which patient*, chained with hashes so edits are detectable.

---

## 10. The monitor and alerts

`python monitor.py` shows a Windows popup when the API, disk space, backup age or AI worker is unhealthy. If you never see a popup, run `python monitor.py check` once. It prints the same checks to the terminal. Start it at login with the scheduled task you created.

---

## 11. Running the tests / the CI is red

- Local: `pytest` in `backend`. It uses a throwaway database and refuses to touch a real one.
- Red cross on GitHub: open **Actions** → the failed run → the failed step. Copy the last 30 lines of that step. Common causes: a test needs updating after a behaviour change; a package was added locally but not to `requirements*.txt`; a TypeScript error (`npm run build` in `frontend` shows it).
- Never merge on red unless you know why.

---

## 12. Before a demo or review

- [ ] `python backup.py run`, then `python backup.py verify`
- [ ] `pytest` is green; the GitHub Actions badge is green
- [ ] `python secrets_check.py` is clean
- [ ] API, worker and web app started; `/health/ready` is green
- [ ] Logged in as nurse, doctor, patient and admin once each (temporary passwords already changed)
- [ ] One full screening: nurse → doctor review → release → patient sees it
- [ ] Wi-Fi off during one nurse screening, then back on, and it uploads
- [ ] `git tag review-3`