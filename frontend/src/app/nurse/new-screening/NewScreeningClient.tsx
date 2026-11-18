"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Card, PageHeader, buttonStyles } from "@/components/ui";
import StatusBadge, { EyeBadge } from "@/components/StatusBadge";
import EyeThumb from "@/components/EyeThumb";
import { addEye, formatDateTime, useDb, type Eye } from "@/lib/db";

const EYES: { key: Eye; label: string }[] = [
  { key: "right", label: "Right eye (OD)" },
  { key: "left", label: "Left eye (OS)" },
];

export default function NewScreeningClient() {
  const db = useDb();
  const id = useSearchParams().get("id");
  if (!db) return null;

  const s = id ? db.screenings.find((x) => x.id === id) : undefined;

  if (!s) {
    const open = db.screenings.filter((x) => x.status !== "completed");
    return (
      <>
        <PageHeader
          title="New Screening"
          subtitle="Continue an open screening, or start a new one."
          action={<Link href="/nurse/verification" className={buttonStyles("gold")}><Plus className="size-4" aria-hidden="true" /> Verify patient and start</Link>}
        />
        <Card>
          <h2 className="mb-3 font-display text-xl font-semibold text-deep">Open screenings</h2>
          {open.length === 0 && <p className="text-sm text-muted-strong">No open screenings.</p>}
          <ul>
            {open.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm">
                <span>
                  <strong className="text-deep">{x.id}</strong>{" "}
                  <span className="text-muted-strong">· {db.patients.find((p) => p.id === x.patientId)?.name} · {formatDateTime(x.createdAt)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <StatusBadge status={x.status} />
                  <Link href={`/nurse/new-screening?id=${x.id}`} className="font-semibold text-navy underline underline-offset-4">Continue</Link>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const patient = db.patients.find((p) => p.id === s.patientId);
  const selected = EYES.filter((e) => s[e.key]);
  const captured = selected.filter((e) => s.images?.[e.key]).length;
  const next = selected.find((e) => !s.images?.[e.key]);
  const previous = db.screenings
    .filter((x) => x.patientId === s.patientId && x.id !== s.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader
        title="New Screening"
        subtitle={`${patient?.name} · ${s.id}`}
        action={
          next ? (
            <Link href={`/nurse/capture?id=${s.id}&eye=${next.key}`} className={buttonStyles("gold")}>Start image capture</Link>
          ) : (
            <Link href={`/nurse/quality?id=${s.id}`} className={buttonStyles("primary")}>Go to image quality check</Link>
          )
        }
      />

      <Card>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Screening ID", s.id],
            ["Patient", `${patient?.name} (${s.patientId})`],
            ["Date and time", formatDateTime(s.createdAt)],
            ["Operator ID", s.operatorId],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-muted-strong">{k}</dt>
              <dd className="mt-1 font-display text-lg font-semibold text-deep">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <h2 className="font-display text-xl font-semibold text-deep">Bilateral screening progress</h2>
          <span className="font-medium text-deep">{captured} of {selected.length} eyes captured</span>
        </div>
        <div
          role="progressbar" aria-valuemin={0} aria-valuemax={selected.length} aria-valuenow={captured}
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-deep/10"
        >
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${selected.length ? (captured / selected.length) * 100 : 0}%` }} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {EYES.map((e) => {
          const state = s[e.key];
          const meta = s.images?.[e.key];
          if (!state) {
            return (
              <Card key={e.key} className="grid place-items-center border-2 border-dashed border-deep/15 bg-transparent text-center shadow-none">
                <p className="text-sm text-muted-strong">{e.label} is not part of this screening.</p>
                <Button variant="ghost" className="mt-3" onClick={() => addEye(s.id, e.key)}>Add this eye</Button>
              </Card>
            );
          }
          return (
            <Card key={e.key}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-semibold text-deep">{e.label}</h3>
                <EyeBadge state={state} />
              </div>
              <EyeThumb imageKey={meta?.processingKey} className="mt-4 max-h-60 w-full" />
              <Link href={`/nurse/capture?id=${s.id}&eye=${e.key}`} className={`${buttonStyles(meta ? "ghost" : "primary")} mt-4 w-full`}>
                {meta ? "View or retake" : `Capture ${e.key} eye`}
              </Link>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-display text-xl font-semibold text-deep">Previous eye records</h2>
        {previous.length === 0 ? (
          <p className="text-sm text-muted-strong">No earlier screenings for this patient.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-strong">
                  <th className="py-2 font-semibold">Screening</th><th className="py-2 font-semibold">Date</th>
                  <th className="py-2 font-semibold">Right (OD)</th><th className="py-2 font-semibold">Left (OS)</th>
                </tr>
              </thead>
              <tbody>
                {previous.map((x) => (
                  <tr key={x.id} className="border-t border-deep/10">
                    <td className="py-3 font-medium text-deep">{x.id}</td>
                    <td className="py-3 text-muted-strong">{formatDateTime(x.createdAt)}</td>
                    <td className="py-3">{x.right ? <EyeBadge state={x.right} /> : "-"}</td>
                    <td className="py-3">{x.left ? <EyeBadge state={x.left} /> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}