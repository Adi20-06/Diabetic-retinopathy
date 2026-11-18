"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { Badge, Button, Card, PageHeader, buttonStyles, inputClass } from "@/components/ui";
import StatusBadge from "@/components/StatusBadge";
import { ageFrom, createScreening, findDuplicates, formatDateTime, markVerified, searchPatients, useDb, type Screening } from "@/lib/db";
import { useSession } from "@/lib/auth";

export default function VerifyClient() {
  const db = useDb();
  const session = useSession();
  const initial = useSearchParams().get("id") ?? "";
  const [query, setQuery] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial);
  const [checks, setChecks] = useState({ name: false, dob: false, mobile: false });
  const [eyes, setEyes] = useState({ right: true, left: true });
  const [created, setCreated] = useState<Screening | null>(null);
  const [vErr, setVErr] = useState("");
  if (!db) return null;

  const patient = db.patients.find((p) => p.id.toLowerCase() === selectedId.toLowerCase());
  const results = searchPatients(db, query);
  const dups = patient ? findDuplicates(db, patient).filter((x) => x.id !== patient.id) : [];
  const history = patient
    ? db.screenings.filter((s) => s.patientId === patient.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];
  const allChecked = checks.name && checks.dob && checks.mobile;
  const canCreate = !!patient?.verified && (eyes.right || eyes.left);

  function pick(id: string) {
    setSelectedId(id); setQuery(id); setChecks({ name: false, dob: false, mobile: false }); setCreated(null);
  }

  return (
    <>
      <PageHeader title="Patient Verification" subtitle="Confirm who the patient is before starting a screening." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card>
            <label htmlFor="q" className="text-sm font-medium text-deep">Search by patient ID, name or mobile</label>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. P002" className={`${inputClass} pl-10`} />
            </div>
            <ul className="mt-3 flex flex-col">
              {results.map((p) => (
                <li key={p.id} className="border-t border-deep/10">
                  <button
                    type="button"
                    onClick={() => pick(p.id)}
                    className={`flex w-full items-center justify-between gap-3 px-2 py-3 text-left text-sm transition hover:bg-page ${patient?.id === p.id ? "bg-gold-light/50" : ""}`}
                  >
                    <span><strong className="text-deep">{p.name}</strong> <span className="text-muted-strong">({p.id})</span></span>
                    {p.verified && <Badge tone="ok">Verified</Badge>}
                  </button>
                </li>
              ))}
              {query.trim() && results.length === 0 && (
                <li className="py-3 text-sm text-muted-strong">
                  No match. <Link href="/nurse/registration" className="font-medium text-navy underline underline-offset-4">Register a new patient</Link>
                </li>
              )}
            </ul>
          </Card>

          {patient && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold text-deep">{patient.name}</h2>
                <div className="flex gap-2">
                  {patient.verified ? <Badge tone="ok">Identity verified</Badge> : <Badge tone="warn">Not verified</Badge>}
                  {patient.consent && <Badge tone="info">Consent on file</Badge>}
                </div>
              </div>
              <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                {[
                  ["Patient ID", patient.id],
                  ["Age / date of birth", `${ageFrom(patient.dob) ?? "?"} years / ${patient.dob}`],
                  ["Gender", patient.gender],
                  ["Mobile", patient.mobile],
                  ["Medical history", patient.history || "None recorded"],
                  ["Registered", formatDateTime(patient.registeredAt)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wide text-muted-strong">{k}</dt>
                    <dd className="mt-0.5 font-medium text-deep">{v}</dd>
                  </div>
                ))}
              </dl>

              {dups.length > 0 && (
                <div role="alert" className="mt-5 flex gap-3 rounded-xl bg-gold-light p-4 text-sm text-deep">
                  <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden="true" />
                  <div>
                    <strong>Possible duplicate record:</strong>{" "}
                    {dups.map((d, i) => (
                      <button key={d.id} type="button" onClick={() => pick(d.id)} className="font-medium underline underline-offset-4">
                        {d.name} ({d.id}){i < dups.length - 1 ? ", " : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="mt-7 text-sm font-semibold uppercase tracking-wide text-muted-strong">Previous screenings</h3>
              {history.length === 0 ? (
                <p className="mt-2 text-sm text-muted-strong">No previous screening.</p>
              ) : (
                <ul className="mt-2">
                  {history.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-deep/10 py-3 text-sm">
                      <span><strong className="text-deep">{s.id}</strong> <span className="text-muted-strong">· {formatDateTime(s.createdAt)}</span></span>
                      <span className="flex items-center gap-3">
                        <StatusBadge status={s.status} />
                        <Link href={`/nurse/results?id=${s.id}`} className="font-semibold text-navy underline underline-offset-4">View</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6 self-start">
          {!patient ? (
            <Card><p className="text-sm text-muted-strong">Search and select a patient to continue.</p></Card>
          ) : (
            <>
              {!patient.verified && (
                <Card>
                  <h2 className="font-display text-xl font-semibold text-deep">Verify identity</h2>
                  <p className="mt-1 text-sm text-muted-strong">Compare with the patient's ID document.</p>
                  <div className="mt-4 flex flex-col gap-3 text-sm text-deep">
                    {([["name", "Name matches"], ["dob", "Date of birth matches"], ["mobile", "Mobile number confirmed"]] as const).map(([k, label]) => (
                      <label key={k} className="flex items-center gap-3">
                        <input type="checkbox" checked={checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} className="size-5 accent-navy" />
                        {label}
                      </label>
                    ))}
                  </div>
                  <Button disabled={!allChecked} onClick={async () => setVErr((await markVerified(patient.id)) ?? "")} className="mt-5 w-full">Confirm identity</Button>
                   {vErr && <p role="alert" className="mt-3 text-sm text-danger">{vErr}</p>}
                </Card>
              )}

              <Card>
                <h2 className="font-display text-xl font-semibold text-deep">New screening</h2>
                <p className="mt-1 text-sm text-muted-strong">Both eyes are stored under one screening ID and tracked separately.</p>
                <div className="mt-4 flex flex-col gap-3 text-sm text-deep">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={eyes.right} onChange={(e) => setEyes({ ...eyes, right: e.target.checked })} className="size-5 accent-navy" /> Right eye (OD)
                  </label>
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={eyes.left} onChange={(e) => setEyes({ ...eyes, left: e.target.checked })} className="size-5 accent-navy" /> Left eye (OS)
                  </label>
                </div>
                {!patient.verified && <p className="mt-3 text-xs text-warn">Verify identity first. A screening needs a verified patient.</p>}
                <Button variant="gold" disabled={!canCreate} onClick={() => setCreated(createScreening(patient.id, eyes, session?.id ?? "N001"))} className="mt-5 w-full">
                  Create new screening
                </Button>
              </Card>

              {created && (
                <Card className="bg-ok-bg">
                  <CheckCircle2 className="size-8 text-ok" aria-hidden="true" />
                  <h2 className="mt-2 font-display text-xl font-semibold text-ok">Screening {created.id} created</h2>
                  <p className="mt-1 text-sm text-deep">
                    {[created.right && "Right eye", created.left && "Left eye"].filter(Boolean).join(" and ")} linked to this screening.
                  </p>
                  <Link href={`/nurse/new-screening?id=${created.id}`} className={`${buttonStyles("primary")} mt-4 w-full`}>Continue to eye selection</Link>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}