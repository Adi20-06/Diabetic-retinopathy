"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card, PageHeader, inputClass } from "@/components/ui";
import PriorityBadge from "@/components/PriorityBadge";
import { DECISION_LABEL, formatDateTime, saveDecision, useDb, type Decision, type Eye, type Screening } from "@/lib/db";
import { GRADES, priorityOf } from "@/lib/mockAi";

const LABEL: Record<Eye, string> = { right: "Right eye (OD)", left: "Left eye (OS)" };
const FOLLOW = ["Within 1 week", "Within 1 month", "In 6 months", "In 12 months", "Not required"];

function Form({ s, patient }: { s: Screening; patient: string }) {
  const router = useRouter();
  const eyes = (["right", "left"] as Eye[]).filter((e) => s[e]);
  const [grades, setGrades] = useState<Partial<Record<Eye, number>>>(() =>
    Object.fromEntries(eyes.map((e) => [e, s.aiResult?.[e]?.grade ?? 0])));
  const [decision, setDecision] = useState<Decision | "">("");
  const [follow, setFollow] = useState(FOLLOW[1]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const overrides = eyes.some((e) => s.aiResult?.[e] && grades[e] !== s.aiResult[e]!.grade);
  const history = [...(s.reviewHistory ?? [])].reverse();

  async function submit() {
    if (s.ai !== "done") return setError("AI results are not available yet. Wait for the record to sync.");
    if (!decision) return setError("Choose a clinical decision.");
    if (overrides && !notes.trim()) return setError("You changed the AI grade. Please write the reason in the notes.");
    try {
      await saveDecision(s.id, { by: "", decision, finalGrades: grades, overrides, notes: notes.trim(), followUp: follow });
      router.push(`/doctor/reports?id=${s.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the decision.");
    }
  }

  return (
    <>
      <PageHeader title="Clinical Review & Decision" subtitle={`${s.id} · ${patient}`} action={<PriorityBadge priority={priorityOf(s)} />} />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-6">
          {eyes.map((e) => {
            const ai = s.aiResult?.[e];
            return (
              <Card key={e}>
                <h2 className="font-display text-xl font-semibold text-deep">{LABEL[e]}</h2>
                <div className="mt-3 rounded-xl bg-page p-4 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-strong">Original AI prediction (preserved, cannot be edited)</div>
                  {ai ? (
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <strong className="text-deep">{GRADES[ai.grade]}</strong>
                      <span className="text-ink">referable {(ai.referableProb * 100).toFixed(1)}%</span>
                      {ai.referable && <Badge tone="danger">Referable</Badge>}
                      {ai.uncertain && <Badge>Uncertain</Badge>}
                    </div>
                  ) : <div className="mt-1 text-muted-strong">Not available yet</div>}
                </div>
                <label className="mt-4 block text-sm font-medium text-deep">Final grade (doctor)
                  <select className={`${inputClass} mt-1`} value={grades[e] ?? 0} onChange={(ev) => setGrades({ ...grades, [e]: +ev.target.value })}>
                    {GRADES.map((g, i) => <option key={g} value={i}>{g}</option>)}
                  </select>
                </label>
                {ai && grades[e] !== ai.grade && <p className="mt-2 text-sm text-warn">This overrides the AI grade ({GRADES[ai.grade]}).</p>}
              </Card>
            );
          })}

          <Card>
            <fieldset>
              <legend className="font-display text-xl font-semibold text-deep">Decision</legend>
              <div className="mt-3 flex flex-col gap-2">
                {(Object.keys(DECISION_LABEL) as Decision[]).map((d) => (
                  <label key={d} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 text-sm ring-1 ${decision === d ? "bg-gold-light ring-gold" : "ring-deep/10 hover:bg-page"}`}>
                    <input type="radio" name="decision" checked={decision === d} onChange={() => setDecision(d)} /> {DECISION_LABEL[d]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-5 block text-sm font-medium text-deep">Follow-up
              <select className={`${inputClass} mt-1`} value={follow} onChange={(e) => setFollow(e.target.value)}>
                {FOLLOW.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm font-medium text-deep">Clinical notes {overrides && <span className="text-danger">(required: reason for override)</span>}
              <textarea className={`${inputClass} mt-1 h-28 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            {error && <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
            <Button variant="gold" className="mt-5" onClick={submit}>Save decision and open report</Button>
          </Card>
        </div>

        <Card className="h-fit">
          <h2 className="font-display text-xl font-semibold text-deep">Review history</h2>
          {history.length === 0 ? <p className="mt-3 text-sm text-muted-strong">No decision recorded yet.</p> : (
            <ul className="mt-2">
              {history.map((h) => (
                <li key={h.at} className="border-t border-deep/10 py-3 text-sm first:border-0">
                  <div className="font-semibold text-deep">{DECISION_LABEL[h.decision]}</div>
                  <div className="text-xs text-muted-strong">{h.by} · {formatDateTime(h.at)} · {h.followUp}</div>
                  {h.overrides && <div className="mt-1"><Badge tone="danger">AI grade overridden</Badge></div>}
                  {h.notes && <div className="mt-1 text-ink">{h.notes}</div>}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/doctor/review?id=${s.id}`} className="mt-4 inline-block text-sm font-semibold text-navy underline underline-offset-4">Back to image review</Link>
        </Card>
      </div>
    </>
  );
}

export default function DecisionClient() {
  const db = useDb();
  const id = useSearchParams().get("id");
  if (!db) return null;
  const s = db.screenings.find((x) => x.id === id && x.sentToDoctor);

  if (!s) {
    const list = db.screenings.filter((x) => x.sentToDoctor && x.doctorReview !== "reviewed");
    return (
      <>
        <PageHeader title="Clinical Review & Decision" subtitle="Cases waiting for a decision." />
        <Card>
          {list.length === 0 && <p className="text-sm text-muted-strong">Nothing is waiting.</p>}
          <ul>{list.map((x) => (
            <li key={x.id} className="flex items-center justify-between border-t border-deep/10 py-3 text-sm first:border-0">
              <span><strong className="text-deep">{x.id}</strong> <span className="text-muted-strong">· {db.patients.find((p) => p.id === x.patientId)?.name}</span></span>
              <Link href={`/doctor/decision?id=${x.id}`} className="font-semibold text-navy underline underline-offset-4">Decide</Link>
            </li>
          ))}</ul>
        </Card>
      </>
    );
  }
  return <Form s={s} patient={db.patients.find((p) => p.id === s.patientId)?.name ?? s.patientId} />;
}