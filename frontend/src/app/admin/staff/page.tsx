"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Field, PageHeader, inputClass } from "@/components/ui";
import { TempPasswordCard } from "@/components/TempPasswordCard";
import { api } from "@/lib/api";

type Staff = { username: string; name: string; role: "nurse" | "doctor"; active: boolean; must_change: boolean; locked: boolean };
type Issued = { username: string; name: string; password: string };

export default function StaffPage() {
  const [list, setList] = useState<Staff[] | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setList(await api<Staff[]>("/admin/staff")); } catch (e) { setError(e instanceof Error ? e.message : "Could not load staff"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    setError(""); setBusy(true);
    try {
      const r = await api<Staff & { temp_password: string }>("/admin/staff", { json: { username: String(f.get("username")), name: String(f.get("name")), role: String(f.get("role")) } });
      setIssued({ username: r.username, name: r.name, password: r.temp_password });
      form.reset(); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  async function reset(s: Staff) {
    if (!window.confirm(`Reset the password for ${s.name} (${s.username})? Their current password will stop working.`)) return;
    setError("");
    try {
      const r = await api<Staff & { temp_password: string }>(`/admin/staff/${s.username}/reset-password`, { method: "POST" });
      setIssued({ username: s.username, name: s.name, password: r.temp_password }); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
  }

  async function toggle(s: Staff) {
    setError("");
    try { await api(`/admin/staff/${s.username}/active`, { json: { active: !s.active } }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
  }

  return (
    <>
      <PageHeader title="Staff Accounts" subtitle="Create nurses and doctors for your health centre. Each gets a random temporary password and must choose their own at first sign-in." />
      {issued && (
        <Card className="mb-6 max-w-xl">
          <TempPasswordCard patientId={issued.username} name={issued.name} password={issued.password} idLabel="Username" />
          <Button variant="ghost" className="mt-3" onClick={() => setIssued(null)}>Done, I have noted it</Button>
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="font-display text-xl font-semibold text-deep">Your staff</h2>
          {!list ? <p className="mt-3 text-sm text-muted-strong">Loading…</p> : list.length === 0 ? <p className="mt-3 text-sm text-muted-strong">No staff yet. Add the first person.</p> : (
            <ul className="mt-3">
              {list.map((s) => (
                <li key={s.username} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm">
                  <div>
                    <div className="font-medium text-deep">{s.name} <span className="text-muted-strong">({s.username})</span></div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge tone="info">{s.role === "nurse" ? "Nurse" : "Doctor"}</Badge>
                      {s.active ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Disabled</Badge>}
                      {s.must_change && <Badge tone="warn">Has not set own password</Badge>}
                      {s.locked && <Badge tone="warn">Locked</Badge>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => reset(s)}>Reset password</Button>
                    <Button variant="ghost" onClick={() => toggle(s)}>{s.active ? "Disable" : "Enable"}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="self-start">
          <h2 className="font-display text-xl font-semibold text-deep">Add staff member</h2>
          <form onSubmit={add} className="mt-4 flex flex-col gap-4">
            <Field id="name" name="name" label="Full name" required />
            <Field id="username" name="username" label="Username" placeholder="e.g. nurse.divya" required />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="role" className="text-sm font-medium text-deep">Role</label>
              <select id="role" name="role" defaultValue="nurse" className={inputClass}>
                <option value="nurse">Nurse / screening operator</option>
                <option value="doctor">Doctor</option>
              </select>
            </div>
            {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" variant="gold" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
          </form>
          <p className="mt-3 text-xs text-muted-strong">Usernames are unique across all centres, so include something specific (for example <code>nurse.divya.kolar</code>) if a short one is taken.</p>
        </Card>
      </div>
    </>
  );
}