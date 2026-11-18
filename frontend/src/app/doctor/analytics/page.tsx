"use client";
import { Card, PageHeader } from "@/components/ui";
import { useDb, type Eye } from "@/lib/db";
import { GRADES, priorityOf } from "@/lib/mockAi";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

function Bars({ items, max }: { items: [string, number][]; max: number }) {
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {items.map(([k, v]) => (
        <li key={k}>
          <div className="flex justify-between text-xs text-ink"><span>{k}</span><span>{v}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-page"><div className="h-full bg-gold" style={{ width: `${max ? (v / max) * 100 : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function Page() {
  const db = useDb();
  if (!db) return null;

  const ss = db.screenings;
  const ai = ss.filter((s) => s.aiResult);
  const referable = ai.filter((s) => priorityOf(s) === "referable").length;
  const uncertain = ai.filter((s) => priorityOf(s) === "uncertain").length;
  const grades = GRADES.map(() => 0);
  let eyesReviewed = 0, agree = 0;
  ss.forEach((s) => {
    (["right", "left"] as Eye[]).forEach((e) => {
      const a = s.aiResult?.[e]; if (a) grades[a.grade]++;
      const last = s.reviewHistory?.[s.reviewHistory.length - 1];
      if (a && last?.finalGrades[e] !== undefined) { eyesReviewed++; if (last.finalGrades[e] === a.grade) agree++; }
    });
  });
  const recapture = ss.filter((s) => s.status === "recapture_required" || s.failedChecks > 0).length;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toLocaleDateString("en-CA"); });
  const perDay: [string, number][] = days.map((d) => [d.slice(5), ss.filter((s) => day(s.createdAt) === d).length]);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

  const stats = [
    ["Total screenings", ss.length],
    ["Referable rate", pct(referable, ai.length)],
    ["Uncertain rate", pct(uncertain, ai.length)],
    ["Recapture rate", pct(recapture, ss.length)],
    ["Doctor agrees with AI", pct(agree, eyesReviewed)],
  ];

  return (
    <>
      <PageHeader title="Analytics" subtitle="Computed from the records on this device." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([k, v]) => <Card key={k as string}><div className="text-xs uppercase tracking-wide text-muted-strong">{k}</div><div className="mt-1 font-display text-3xl font-semibold text-deep">{v}</div></Card>)}
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card><h2 className="font-display text-xl font-semibold text-deep">AI grade distribution (eyes)</h2><Bars items={GRADES.map((g, i) => [g, grades[i]])} max={Math.max(...grades)} /></Card>
        <Card><h2 className="font-display text-xl font-semibold text-deep">Screenings, last 7 days</h2><Bars items={perDay} max={Math.max(...perDay.map((d) => d[1]))} /></Card>
      </div>
    </>
  );
}