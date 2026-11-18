"use client";
import { useState } from "react";
import { Badge, Card, PageHeader, inputClass } from "@/components/ui";
import { formatDateTime, useDb, type Eye , type IqaStored } from "@/lib/db";

export default function Page() {
  const db = useDb();
  const [only, setOnly] = useState<"all" | "fail">("all");
  if (!db) return null;

  const rows = db.screenings.flatMap((s) =>
    (["right", "left"] as Eye[]).filter((e) => s.quality?.[e]).map((e) => ({ s, e, q: s.quality![e]! })))
    .sort((a, b) => b.q.assessedAt.localeCompare(a.q.assessedAt))
    .filter((r) => only === "all" || !r.q.gradable);

  const all = db.screenings.flatMap((s) => (["right", "left"] as Eye[]).map((e) => s.quality?.[e]).filter((q): q is IqaStored => !!q));
  const n = all.length;
  const gradable = all.filter((q) => q.gradable).length;
  const avg = n ? Math.round(all.reduce((a: number, q) => a + q.score, 0) / n) : 0;
  const fails: Record<string, number> = {};
  all.forEach((q) => q.checks.filter((c) => !c.ok).forEach((c) => (fails[c.id] = (fails[c.id] ?? 0) + 1)));
  const topFail = Object.entries(fails).sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <PageHeader title="Image Quality Assessment" subtitle="Quality results recorded at capture. Ungradable images never reach the AI." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Images checked", n], ["Gradable", n ? `${Math.round((gradable / n) * 100)}%` : "-"], ["Average score", avg], ["Most common failure", topFail ? `${topFail[0]} (${topFail[1]})` : "None"]].map(([k, v]) => (
          <Card key={k as string}><div className="text-xs uppercase tracking-wide text-muted-strong">{k}</div><div className="mt-1 font-display text-2xl font-semibold capitalize text-deep">{v}</div></Card>
        ))}
      </div>

      <Card className="mt-6 overflow-x-auto">
        <select className={`${inputClass} mb-4 max-w-xs`} value={only} onChange={(e) => setOnly(e.target.value as "all" | "fail")} aria-label="Filter">
          <option value="all">All images</option><option value="fail">Not gradable only</option>
        </select>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="text-xs uppercase tracking-wide text-muted-strong"><th className="py-2">Screening</th><th className="py-2">Eye</th><th className="py-2">Checked</th><th className="py-2">Score</th><th className="py-2">Result</th><th className="py-2">Failed checks</th></tr></thead>
          <tbody>
            {rows.map(({ s, e, q }) => (
              <tr key={s.id + e + q.assessedAt} className="border-t border-deep/10">
                <td className="py-3 font-medium text-deep">{s.id}</td>
                <td className="py-3">{e === "right" ? "OD" : "OS"}</td>
                <td className="py-3 text-muted-strong">{formatDateTime(q.assessedAt)}</td>
                <td className="py-3">{q.score}</td>
                <td className="py-3"><Badge tone={q.gradable ? "ok" : "danger"}>{q.gradable ? "Gradable" : "Not gradable"}</Badge></td>
                <td className="py-3 text-ink">{q.checks.filter((c) => !c.ok).map((c) => c.id).join(", ") || "None"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-strong">No quality records.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}