"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { ageFrom, DECISION_LABEL, formatDateTime, releaseReport, useDb, type Eye } from "@/lib/db";
import { GRADES } from "@/lib/mockAi";

const LABEL: Record<Eye, string> = { right: "Right eye (OD)", left: "Left eye (OS)" };

export default function ReportsClient() {
  const db = useDb();
  const id = useSearchParams().get("id");
  if (!db) return null;

  const reviewed = db.screenings.filter((s) => s.reviewHistory?.length);
  const s = reviewed.find((x) => x.id === id);

  if (!s) {
    return (
      <>
        <PageHeader title="Report Management" subtitle="Reports exist once a doctor has recorded a decision." />
        <Card>
          {reviewed.length === 0 && <p className="text-sm text-muted-strong">No reports yet.</p>}
          <ul>{reviewed.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm first:border-0">
              <span><strong className="text-deep">RPT-{x.id}</strong> <span className="text-muted-strong">· {db.patients.find((p) => p.id === x.patientId)?.name}</span></span>
              <span className="flex items-center gap-3">
                {x.reportReleased ? <Badge tone="ok">Released to patient</Badge> : <Badge>Not released</Badge>}
                <Link href={`/doctor/reports?id=${x.id}`} className="font-semibold text-navy underline underline-offset-4">Open</Link>
              </span>
            </li>
          ))}</ul>
        </Card>
      </>
    );
  }

  const p = db.patients.find((x) => x.id === s.patientId);
  const last = s.reviewHistory![s.reviewHistory!.length - 1];
  const eyes = (["right", "left"] as Eye[]).filter((e) => s[e]);

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Report Management" subtitle={`RPT-${s.id}`} action={
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => window.print()}><Printer className="size-4" aria-hidden="true" /> Print / save as PDF</Button>
            <Button variant="gold" disabled={!!s.reportReleased} onClick={() => releaseReport(s.id)}>{s.reportReleased ? "Released" : "Release to patient"}</Button>
          </div>
        } />
        <p className="mb-4 text-sm text-muted-strong">To get a PDF, press Print and choose &quot;Save as PDF&quot; as the printer.</p>
      </div>

      <Card className="print:shadow-none">
        <div className="flex items-start justify-between border-b border-deep/10 pb-4">
          <div><div className="text-xs uppercase tracking-wide text-muted-strong">Diabetic retinopathy screening report</div><h2 className="font-display text-2xl font-semibold text-deep">RPT-{s.id}</h2></div>
          <div className="text-right text-sm text-muted-strong">Reviewed {formatDateTime(last.at)}<br />by {last.by}</div>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-4">
          {[["Patient", p?.name ?? ""], ["Patient ID", p?.id ?? ""], ["Age / gender", `${ageFrom(p?.dob ?? "") ?? "?"} / ${p?.gender}`], ["Screened", formatDateTime(s.createdAt)]].map(([k, v]) => (
            <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-strong">{k}</dt><dd className="mt-0.5 font-medium text-deep">{v}</dd></div>
          ))}
        </dl>

        <table className="mt-6 w-full text-left text-sm">
          <thead><tr className="text-xs uppercase tracking-wide text-muted-strong"><th className="py-2">Eye</th><th className="py-2">AI suggestion</th><th className="py-2">Doctor&apos;s grade</th><th className="py-2">Image checksum</th></tr></thead>
          <tbody>{eyes.map((e) => {
            const ai = s.aiResult?.[e]; const fg = last.finalGrades[e];
            return (
              <tr key={e} className="border-t border-deep/10">
                <td className="py-3 font-medium text-deep">{LABEL[e]}</td>
                <td className="py-3">{ai ? `${GRADES[ai.grade]} (referable ${(ai.referableProb * 100).toFixed(0)}%)` : "-"}</td>
                <td className="py-3 font-semibold text-deep">{fg !== undefined ? GRADES[fg] : "-"}{ai && fg !== ai.grade && <span className="ml-2 text-xs text-danger">overrides AI</span>}</td>
                <td className="py-3 font-mono text-xs text-muted-strong">{s.images?.[e]?.checksum.slice(0, 16)}…</td>
              </tr>
            );
          })}</tbody>
        </table>

        <div className="mt-6 rounded-xl bg-gold-light/60 p-4 text-sm text-deep">
          <div className="font-display text-lg font-semibold">{DECISION_LABEL[last.decision]}</div>
          <div>Follow-up: {last.followUp}</div>
          {last.notes && <div className="mt-2">Notes: {last.notes}</div>}
        </div>
        <p className="mt-6 text-xs text-muted-strong">AI output was used only as supporting evidence. The final decision was made by the reviewing doctor.</p>
      </Card>
    </>
  );
}