"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Search } from "lucide-react";
import { Button, Card, Field, PageHeader, buttonStyles, inputClass } from "@/components/ui";
import { addPatient, ageFrom, findDuplicates, searchPatients, useDb, type Patient } from "@/lib/db";


export default function RegistrationPage() {
  const db = useDb();
  const formRef = useRef<HTMLFormElement>(null);
  const [q, setQ] = useState("");
  const [dob, setDob] = useState("");
  const [idChecked, setIdChecked] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [dups, setDups] = useState<Patient[]>([]);
  const [saved, setSaved] = useState<Patient | null>(null);
  const [busy, setBusy] = useState(false);
  if (!db) return null;

  const matches = searchPatients(db, q);
  const age = ageFrom(dob);

  async function save(force: boolean) {
    const f = new FormData(formRef.current!);
    const input = {
      name: String(f.get("name")).trim(),
      dob: String(f.get("dob")),
      gender: String(f.get("gender")),
      mobile: String(f.get("mobile")),
      history: String(f.get("history") ?? "").trim(),
    };
    setError("");
    if (!/^\d{10}$/.test(input.mobile)) return setError("Enter a 10-digit mobile number.");
    if (!idChecked) return setError("Confirm that the patient's identity was verified.");
    if (!consent) return setError("Consent must be confirmed before saving.");
    const d = findDuplicates(db!, input);          // quick check against the cached list
    if (d.length && !force) return setDups(d);
    setBusy(true);
    const r = await addPatient(input, force);      // the server makes the final duplicate check
    setBusy(false);
    if (r.duplicates && !force) return setDups(r.duplicates);
    if (r.error) return setError(r.error);
    setSaved(r.patient!);
  }

  function again() {
    setSaved(null); setDups([]); setDob(""); setIdChecked(false); setConsent(false); setError("");
  }

  if (saved) {
    return (
      <>
        <PageHeader title="Patient Registration" />
        <Card className="max-w-xl">
          <CheckCircle2 className="size-10 text-ok" aria-hidden="true" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-deep">Registration saved</h2>
          <p className="mt-2 text-sm text-muted-strong">{saved.name} has been registered and verified.</p>
          <div className="mt-5 rounded-xl bg-gold-light/60 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-strong">Patient ID</div>
            <div className="font-display text-3xl font-semibold text-deep">{saved.id}</div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/nurse/verification?id=${saved.id}`} className={buttonStyles("gold")}>Start screening</Link>
            <Button variant="ghost" onClick={again}>Register another</Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Patient Registration" subtitle="Register a new patient and create their record." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <form ref={formRef} onSubmit={(e) => { e.preventDefault(); save(false); }} className="flex flex-col gap-5">
            <div className="rounded-xl bg-page px-4 py-3 text-sm">
              <span className="text-muted-strong">Patient ID (automatic): </span>
              <strong className="text-deep">assigned when saved</strong>
            </div>
            <Field id="name" name="name" label="Patient name" required />
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="dob" className="text-sm font-medium text-deep">Date of birth</label>
                <input id="dob" name="dob" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} className={inputClass} />
                {age !== null && <span className="text-xs text-muted-strong">Age: {age} years</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gender" className="text-sm font-medium text-deep">Gender</label>
                <select id="gender" name="gender" defaultValue="" required className={inputClass}>
                  <option value="" disabled>Select</option>
                  <option>Female</option><option>Male</option><option>Other</option>
                </select>
              </div>
              <Field id="mobile" name="mobile" type="tel" inputMode="numeric" label="Mobile number" placeholder="10 digits" required />
            </div>
            <Field id="history" name="history" label="Medical history (optional)" placeholder="e.g. Type 2 diabetes for 8 years" />

            <label className="flex items-start gap-3 text-sm text-deep">
              <input type="checkbox" checked={idChecked} onChange={(e) => setIdChecked(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-navy" />
              I have verified the patient's identity against an ID document.
            </label>
            <label className="flex items-start gap-3 rounded-xl bg-gold-light/60 p-4 text-sm leading-relaxed text-deep">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-navy" />
              The patient has consented to screening, image storage and AI-assisted analysis, with doctor review.
            </label>

            {dups.length > 0 && (
              <div role="alert" className="rounded-xl bg-gold-light p-4 text-sm text-deep">
                <strong>Possible duplicate record{dups.length > 1 ? "s" : ""}:</strong>
                <ul className="mt-2 list-disc pl-5">
                  {dups.map((d) => (
                    <li key={d.id}>
                      {d.name} ({d.id}), {d.mobile}.{" "}
                      <Link href={`/nurse/verification?id=${d.id}`} className="font-medium underline underline-offset-4">Open this record</Link>
                    </li>
                  ))}
                </ul>
                <Button type="button" variant="ghost" className="mt-3" onClick={() => save(true)}>Register anyway</Button>
              </div>
            )}
            {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
            <Button type="submit" variant="gold" disabled={busy} className="h-12 self-start px-8">{busy ? "Saving…" : "Save registration"}</Button>
          </form>
        </Card>

        <Card className="self-start">
          <h2 className="font-display text-xl font-semibold text-deep">Search existing patient</h2>
          <p className="mt-1 text-sm text-muted-strong">Check before registering to avoid duplicates.</p>
          <label className="relative mt-4 block">
            <span className="sr-only">Search by ID, name or mobile</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, name or mobile" className={`${inputClass} pl-10`} />
          </label>
          <ul className="mt-3 flex flex-col">
            {matches.map((p) => (
              <li key={p.id} className="border-t border-deep/10 py-3 text-sm">
                <div className="font-medium text-deep">{p.name} <span className="text-muted-strong">({p.id})</span></div>
                <div className="text-xs text-muted-strong">{p.mobile}</div>
                <Link href={`/nurse/verification?id=${p.id}`} className="mt-1 inline-block text-xs font-semibold text-navy underline underline-offset-4">Open for screening</Link>
              </li>
            ))}
            {q.trim() && matches.length === 0 && <li className="py-3 text-sm text-muted-strong">No matching patient.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}