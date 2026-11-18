"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge, Card, PageHeader, buttonStyles } from "@/components/ui";
import PriorityBadge from "@/components/PriorityBadge";
import GradcamViewer from "@/components/GradcamViewer";
import { ageFrom, formatDateTime, useDb, type Eye } from "@/lib/db";
import { GRADES, priorityOf, RANK } from "@/lib/mockAi";

const LABEL: Record<Eye, string> = { right: "Right eye (OD)", left: "Left eye (OS)" };

export default function ReviewClient() {
  const db = useDb();
  const params = useSearchParams();
  const id = params.get("id");
  if (!db) return null;

  const s = db.screenings.find((x) => x.id === id);

  if (!s) {
    const queue = db.screenings.filter((x) => x.sentToDoctor)
      .sort((a, b) => RANK[priorityOf(a)] - RANK[priorityOf(b)] || a.sentToDoctor!.localeCompare(b.sentToDoctor!));
    return (
      <>
        <PageHeader title="Screening Review" subtitle="Most urgent cases first." />
        <Card>
          {queue.length === 0 && <p className="text-sm text-muted-strong">No cases have been sent yet.</p>}
          <ul>
            {queue.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm first:border-0">
                <span><strong className="text-deep">{x.id}</strong> <span className="text-muted-strong">· {db.patients.find((p) => p.id === x.patientId)?.name} · sent {formatDateTime(x.sentToDoctor!)}</span></span>
                <span className="flex items-center gap-3">
                  {x.doctorReview === "reviewed" ? <Badge tone="ok">Reviewed</Badge> : <PriorityBadge priority={priorityOf(x)} />}
                  <Link href={`/doctor/review?id=${x.id}`} className="font-semibold text-navy underline underline-offset-4">Open</Link>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const p = db.patients.find((x) => x.id === s.patientId);
  const eyes = (["right", "left"] as Eye[]).filter((e) => s[e]);
  const q = params.get("eye");
  const eye: Eye = q === "left" || q === "right" ? (eyes.includes(q) ? q : eyes[0]) : eyes[0] ?? "right";
  const img = s.images?.[eye];
  const ai = s.aiResult?.[eye];
  const quality = s.quality?.[eye];

  return (
    <>
      <PageHeader title="Screening Review" subtitle={`${s.id} · ${p?.name} · ${ageFrom(p?.dob ?? "") ?? "?"} / ${p?.gender}`} action={<PriorityBadge priority={priorityOf(s)} />} />

      <div role="note" className="mb-6 flex items-start gap-3 rounded-xl bg-gold-light p-4 text-sm text-deep">
        <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden="true" />
        <span>AI output is supporting evidence only. It is not a diagnosis. The final decision is the doctor&apos;s.</span>
      </div>

      {eyes.length > 1 && (
        <div className="mb-6 flex gap-2" role="tablist" aria-label="Eye">
          {eyes.map((e) => (
            <Link key={e} href={`/doctor/review?id=${s.id}&eye=${e}`} role="tab" aria-selected={e === eye}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${e === eye ? "bg-navy text-white" : "bg-white text-ink ring-1 ring-deep/10 hover:bg-page"}`}>
              {LABEL[e]}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <h2 className="mb-4 font-display text-xl font-semibold text-deep">{LABEL[eye]}</h2>
          <GradcamViewer imageKey={img.processingKey} imageUrl={img.url} heatUrl={img.heatmapUrl} seed={`${img.checksum}${eye}`} />
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="font-display text-xl font-semibold text-deep">AI prediction</h2>
            {!ai ? (
              <p className="mt-3 text-sm text-muted-strong">AI results are not available yet. They are created when the nurse&apos;s record syncs.</p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={ai.referable ? "danger" : "ok"}>{ai.referable ? "Referable" : "Non-referable"}</Badge>
                  {ai.uncertain && <Badge>Uncertain, review carefully</Badge>}
                </div>
                <div className="mt-4 text-sm text-muted-strong">Predicted grade</div>
                <div className="font-display text-2xl font-semibold text-deep">{GRADES[ai.grade]}</div>
                <div className="mt-1 text-sm text-ink">Referable probability <strong>{(ai.referableProb * 100).toFixed(1)}%</strong></div>

                <ul className="mt-5 flex flex-col gap-3" aria-label="Class probabilities">
                  {GRADES.map((g, i) => (
                    <li key={g}>
                      <div className="flex justify-between text-xs text-ink"><span>{g}</span><span>{(ai.probs[i] * 100).toFixed(1)}%</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-page"><div className={`h-full ${i === ai.grade ? "bg-gold" : "bg-navy/40"}`} style={{ width: `${ai.probs[i] * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-muted-strong">Uncertainty (entropy) {ai.entropy.toFixed(2)}. Demo values until the model is connected.</p>
              </>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-xl font-semibold text-deep">Image quality</h2>
            {quality ? (
              <>
                <div className="mt-2 flex items-center gap-2"><span className="font-display text-2xl font-semibold text-deep">{quality.score}</span><Badge tone={quality.gradable ? "ok" : "danger"}>{quality.gradable ? "Gradable" : "Not gradable"}</Badge></div>
                <ul className="mt-3 text-sm text-ink">
                  {quality.checks.map((c) => <li key={c.id} className="flex justify-between border-t border-deep/10 py-1.5 first:border-0"><span className="capitalize">{c.id}</span><span className={c.ok ? "text-ok" : "text-danger"}>{c.ok ? "Pass" : "Fail"}</span></li>)}
                </ul>
              </>
            ) : <p className="mt-2 text-sm text-muted-strong">No quality record.</p>}
          </Card>

          <Card>
            <div className="text-xs uppercase tracking-wide text-muted-strong">Clinical decision</div>
            <p className="mt-1 text-sm text-ink">Confirm or override the AI result and record follow-up </p>
            <Link href={`/doctor/decision?id=${s.id}`} className={`${buttonStyles("gold")} mt-3`}>Go to decision</Link>
          </Card>
        </div>
      </div>
    </>
  );
}