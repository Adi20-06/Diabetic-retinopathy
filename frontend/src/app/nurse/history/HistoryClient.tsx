"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, PageHeader, inputClass } from "@/components/ui";
import StatusBadge from "@/components/StatusBadge";
import { formatDateTime, useDb, type Eye, type Screening } from "@/lib/db";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

function recaptures(s: Screening) {
  return (["right", "left"] as Eye[]).reduce((n, e) => n + Math.max(0, (s.captures ?? []).filter((c) => c.eye === e).length - 1), 0);
}

function qualityText(s: Screening) {
  const parts = (["right", "left"] as Eye[]).filter((e) => s[e]).map((e) => {
    const q = s.quality?.[e];
    return `${e === "right" ? "OD" : "OS"}: ${q ? (q.gradable ? "Gradable" : "Not gradable") : "Not checked"}`;
  });
  return parts.length ? parts.join(" · ") : "No images";
}

export default function HistoryClient() {
  const db = useDb();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (!db) return null;

  const rows = [...db.screenings]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((s) => s.id.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((s) => (!from || day(s.createdAt) >= from) && (!to || day(s.createdAt) <= to));

  const review = (s: Screening) => (!s.sentToDoctor ? "Not sent" : s.doctorReview === "reviewed" ? "Reviewed" : "Waiting");

  return (
    <>
      <PageHeader title="Screening History" subtitle="Screenings stored on this device." />
      <Card>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium text-deep">Screening ID
            <input className={`${inputClass} mt-1`} placeholder="e.g. SCR-1004" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-deep">From
            <input type="date" className={`${inputClass} mt-1`} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-deep">To
            <input type="date" className={`${inputClass} mt-1`} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </Card>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-strong">
              <th className="py-2">Screening</th><th className="py-2">Patient</th><th className="py-2">Date & time</th>
              <th className="py-2">Capture status</th><th className="py-2">Quality</th><th className="py-2">Recaptures</th><th className="py-2">Doctor review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-deep/10">
                <td className="py-3"><Link href={`/nurse/results?id=${s.id}`} className="font-semibold text-navy underline underline-offset-4">{s.id}</Link></td>
                <td className="py-3 text-deep">{db.patients.find((p) => p.id === s.patientId)?.name ?? s.patientId}</td>
                <td className="py-3 text-muted-strong">{formatDateTime(s.createdAt)}</td>
                <td className="py-3"><StatusBadge status={s.status} /></td>
                <td className="py-3 text-ink">{qualityText(s)}</td>
                <td className="py-3 text-ink">{recaptures(s)}</td>
                <td className="py-3 text-ink">{review(s)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-strong">No screenings match.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}