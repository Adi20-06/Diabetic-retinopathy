"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, PageHeader, inputClass } from "@/components/ui";
import PriorityBadge from "@/components/PriorityBadge";
import { ageFrom, formatDateTime, useDb } from "@/lib/db";
import { priorityOf } from "@/lib/mockAi";

export default function Page() {
  const db = useDb();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  if (!db) return null;

  const term = q.trim().toLowerCase();
  const mine = new Set(db.screenings.filter((s) => s.sentToDoctor).map((s) => s.patientId));   // only patients with a case sent to this doctor
  const list = db.patients.filter((p) => mine.has(p.id) && (!term || p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term) || p.mobile.includes(term)));
  const p = db.patients.find((x) => x.id === sel);
  const history = db.screenings.filter((s) => s.patientId === sel && s.sentToDoctor).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader title="Patient Management" subtitle="Search patients and open their screening history." />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <input className={inputClass} placeholder="Search by name, patient ID or mobile" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
          <table className="mt-4 w-full text-left text-sm">
            <thead><tr className="text-xs uppercase tracking-wide text-muted-strong"><th className="py-2">ID</th><th className="py-2">Name</th><th className="py-2">Age / gender</th><th className="py-2">Mobile</th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id} className={`cursor-pointer border-t border-deep/10 hover:bg-page ${sel === x.id ? "bg-gold-light/50" : ""}`} onClick={() => setSel(x.id)}>
                  <td className="py-3 font-medium text-deep">{x.id}</td>
                  <td className="py-3"><button type="button" onClick={() => setSel(x.id)} className="font-medium text-navy underline underline-offset-4">{x.name}</button></td>
                  <td className="py-3 text-ink">{ageFrom(x.dob) ?? "?"} / {x.gender}</td>
                  <td className="py-3 text-ink">{x.mobile}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-strong">No patients match.</td></tr>}
            </tbody>
          </table>
        </Card>

        <Card>
          {!p ? (
            <p className="text-sm text-muted-strong">Select a patient to see details.</p>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold text-deep">{p.name}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {[["Patient ID", p.id], ["Age / gender", `${ageFrom(p.dob) ?? "?"} / ${p.gender}`], ["Mobile", p.mobile], ["Date of birth", p.dob]].map(([k, v]) => (
                  <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-strong">{k}</dt><dd className="mt-0.5 font-medium text-deep">{v}</dd></div>
                ))}
              </dl>
              <h3 className="mt-6 text-sm font-semibold text-deep">Screening history</h3>
              {history.length === 0 ? <p className="mt-2 text-sm text-muted-strong">No screenings yet.</p> : (
                <ul className="mt-1">
                  {history.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 border-t border-deep/10 py-2 text-sm first:border-0">
                      <span><strong className="text-deep">{s.id}</strong><br /><span className="text-xs text-muted-strong">{formatDateTime(s.createdAt)}</span></span>
                      <span className="flex items-center gap-2">
                        {s.sentToDoctor && <PriorityBadge priority={priorityOf(s)} />}
                        {s.sentToDoctor && <Link href={`/doctor/review?id=${s.id}`} className="font-semibold text-navy underline underline-offset-4">Review</Link>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}