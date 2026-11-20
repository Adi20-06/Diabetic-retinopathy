"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Badge, Button, Card, PageHeader, buttonStyles } from "@/components/ui";
import StatusBadge, { EyeBadge } from "@/components/StatusBadge";
import DoctorPicker from "@/components/DoctorPicker";
import { ageFrom, formatDateTime, reassignDoctor, sendToDoctor, useDb, type Eye } from "@/lib/db";

const EYES: { key: Eye; label: string }[] = [
  { key: "right", label: "Right eye (OD)" },
  { key: "left", label: "Left eye (OS)" },
];

export default function ResultsClient() {
  const db = useDb();
  const id = useSearchParams().get("id");
  const [sheet, setSheet] = useState(false);
  const [picker, setPicker] = useState<"send" | "change" | null>(null);
  const [msg, setMsg] = useState("");
  if (!db) return null;

  const s = db.screenings.find((x) => x.id === id);

  if (!s) {
    const list = [...db.screenings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return (
      <>
        <PageHeader title="Screening Results" subtitle="Open a screening to see its status." />
        <Card>
          <ul>
            {list.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm first:border-0">
                <span><strong className="text-deep">{x.id}</strong> <span className="text-muted-strong">· {db.patients.find((p) => p.id === x.patientId)?.name} · {formatDateTime(x.createdAt)}</span></span>
                <span className="flex items-center gap-3"><StatusBadge status={x.status} /><Link href={`/nurse/results?id=${x.id}`} className="font-semibold text-navy underline underline-offset-4">Open</Link></span>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const p = db.patients.find((x) => x.id === s.patientId);
  const chosen = EYES.filter((e) => s[e.key]);
  const canSend = s.status === "completed" && !s.sentToDoctor;
  const aiLabel = s.ai === "done" ? "Processed" : s.ai === "queued" ? "Queued, runs after sync" : "Not started";
  const reviewLabel = !s.sentToDoctor ? "Not sent to doctor" : s.doctorReview === "reviewed" ? "Reviewed" : "Waiting for doctor";
  const nextStep = (e: Eye) => {
    const st = s[e];
    if (st === "pending") return { href: `/nurse/capture?id=${s.id}&eye=${e}`, label: "Capture image" };
    if (st === "captured") return { href: `/nurse/quality?id=${s.id}&eye=${e}`, label: "Run quality check" };
    if (st === "quality_failed") return { href: `/nurse/recapture?id=${s.id}&eye=${e}`, label: "Recapture" };
    return null;
  };

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Screening Results"
          subtitle={`${s.id} · ${p?.name}`}
          action={<StatusBadge status={s.status} />}
        />

        <div className="grid gap-6 md:grid-cols-2">
          {chosen.map((e) => {
            const q = s.quality?.[e.key];
            const step = nextStep(e.key);
            return (
              <Card key={e.key}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold text-deep">{e.label}</h2>
                  <EyeBadge state={s[e.key]!} />
                </div>
                <dl className="mt-4 flex flex-col gap-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-strong">Image quality</dt>
                    <dd className="font-medium text-deep">{q ? `${q.gradable ? "Gradable" : "Not gradable"} · score ${q.score}` : "Not checked"}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-strong">Capture attempts</dt>
                    <dd className="font-medium text-deep">{(s.captures ?? []).filter((c) => c.eye === e.key).length}</dd></div>
                </dl>
                {step && <Link href={step.href} className={`${buttonStyles("gold")} mt-4`}>{step.label}</Link>}
              </Card>
            );
          })}
        </div>

        <Card className="mt-6">
          <dl className="grid gap-5 text-sm sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Screening ID", s.id],
              ["AI processing", aiLabel],
              ["Doctor review", reviewLabel],
              ["Assigned doctor", s.assignedName ?? s.assignedTo ?? "Not chosen yet"],
              ["Sync", s.synced ? "Synced" : "Waiting to sync"],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-strong">{k}</dt><dd className="mt-1 font-display text-lg font-semibold text-deep">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3 border-t border-deep/10 pt-5">
            <Button variant="gold" disabled={!canSend} onClick={() => { setMsg(""); setPicker("send"); }}>Send to doctor</Button>
            {s.sentToDoctor && s.doctorReview !== "reviewed" && (
              <Button variant="ghost" disabled={!s.synced} onClick={() => { setMsg(""); setPicker("change"); }}>Change doctor</Button>
            )}
            <Button variant="ghost" onClick={() => setSheet(true)}>Generate worker triage sheet</Button>
          </div>
          {s.status !== "completed" && <p className="mt-3 text-xs text-muted-strong">Every selected eye must have an accepted, gradable image before sending to the doctor.</p>}
        </Card>
        {picker && (
          <div className="mt-6">
            <DoctorPicker
              title={picker === "send" ? "Send to which doctor?" : "Change doctor"}
              current={s.assignedTo}
              onCancel={() => setPicker(null)}
              onSend={async (d) => {
                if (picker === "send") {
                  sendToDoctor(s.id, d);
                  setMsg(`Saved. It will go to ${d.name} when you sync.`);
                } else {
                  const err = await reassignDoctor(s.id, d);
                  setMsg(err ?? `Changed. ${d.name} will now see this case.`);
                }
                setPicker(null);
              }}
            />
          </div>
        )}
        {msg && <p role="status" className="mt-4 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">{msg}</p>}
      </div>

      {sheet && (
        <Card className="mt-6 print:mt-0 print:shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-strong">Worker triage sheet</div>
              <h2 className="font-display text-2xl font-semibold text-deep">{s.id}</h2>
            </div>
            <Button variant="ghost" className="print:hidden" onClick={() => window.print()}><Printer className="size-4" aria-hidden="true" /> Print</Button>
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            {[
              ["Patient", `${p?.name} (${p?.id})`],
              ["Age / gender", `${ageFrom(p?.dob ?? "") ?? "?"} / ${p?.gender}`],
              ["Mobile", p?.mobile ?? ""],
              ["Screened", formatDateTime(s.createdAt)],
              ["Operator", s.operatorId],
              ["Sent to", s.assignedName ?? s.assignedTo ?? "Not sent yet"],
              ["Generated", formatDateTime(new Date().toISOString())],
            ].map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-strong">{k}</dt><dd className="mt-0.5 font-medium text-deep">{v}</dd></div>
            ))}
          </dl>
          <table className="mt-6 w-full text-left text-sm">
            <thead><tr className="text-xs uppercase tracking-wide text-muted-strong"><th className="py-2">Eye</th><th className="py-2">Status</th><th className="py-2">Image quality</th></tr></thead>
            <tbody>
              {chosen.map((e) => {
                const q = s.quality?.[e.key];
                return (
                  <tr key={e.key} className="border-t border-deep/10">
                    <td className="py-3 font-medium text-deep">{e.label}</td>
                    <td className="py-3">{s[e.key]}</td>
                    <td className="py-3">{q ? `${q.gradable ? "Gradable" : "Not gradable"} (${q.score})` : "Not checked"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-6 rounded-xl bg-gold-light/60 p-4 text-sm text-deep">
            Next step: {reviewLabel.toLowerCase()}. The patient receives the doctor-reviewed result and follow-up instructions.
            AI output is supporting evidence for the doctor and is not a diagnosis.
          </p>
        </Card>
      )}
    </>
  );
}