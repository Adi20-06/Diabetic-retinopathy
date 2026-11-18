"use client";
import Link from "next/link";
import { Card, PageHeader, buttonStyles } from "@/components/ui";
import PriorityBadge from "@/components/PriorityBadge";
import { formatDateTime, useDb } from "@/lib/db";
import { priorityOf, RANK } from "@/lib/mockAi";

export default function Page() {
  const db = useDb();
  if (!db) return null;

  const sent = db.screenings.filter((s) => s.sentToDoctor);
  const waiting = sent.filter((s) => s.doctorReview !== "reviewed");
  const count = (p: string) => waiting.filter((s) => priorityOf(s) === p).length;
  const top = [...waiting].sort((a, b) => RANK[priorityOf(a)] - RANK[priorityOf(b)]).slice(0, 5);

  const stats = [
    ["Patients", db.patients.length],
    ["Waiting for review", waiting.length],
    ["Referable flagged", count("referable")],
    ["Uncertain cases", count("uncertain")],
    ["Reviewed", sent.length - waiting.length],
  ];

  return (
    <>
      <PageHeader title="Doctor Dashboard" subtitle="Cases are sorted so the most urgent are reviewed first." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map(([k, v]) => (
          <Card key={k}>
            <div className="text-xs uppercase tracking-wide text-muted-strong">{k}</div>
            <div className="mt-1 font-display text-3xl font-semibold text-deep">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-deep">Review queue</h2>
          <Link href="/doctor/review" className="text-sm font-semibold text-navy underline underline-offset-4">See all</Link>
        </div>
        {top.length === 0 ? (
          <p className="mt-3 text-sm text-muted-strong">No cases are waiting. Cases appear here after a nurse sends them and the record syncs.</p>
        ) : (
          <ul className="mt-2">
            {top.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm first:border-0">
                <span><strong className="text-deep">{s.id}</strong> <span className="text-muted-strong">· {db.patients.find((p) => p.id === s.patientId)?.name} · sent {formatDateTime(s.sentToDoctor!)}</span></span>
                <span className="flex items-center gap-3"><PriorityBadge priority={priorityOf(s)} /><Link href={`/doctor/review?id=${s.id}`} className={buttonStyles("primary")}>Review</Link></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
} 