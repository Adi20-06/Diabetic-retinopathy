"use client";
import Link from "next/link";
import { Plus, Wifi, WifiOff } from "lucide-react";
import { Card, PageHeader, StatCard, buttonStyles } from "@/components/ui";
import StatusBadge from "@/components/StatusBadge";
import { formatDateTime, isToday, resetDemo, useDb } from "@/lib/db";
import { useOnline } from "@/lib/online";

export default function NurseDashboard() {
  const db = useDb();
  const online = useOnline();
  if (!db) return null;

  const today = db.screenings.filter((s) => isToday(s.createdAt));
  const n = (st: string) => today.filter((s) => s.status === st).length;
  const failed = today.reduce((sum, s) => sum + s.failedChecks, 0);
  const recapture = db.screenings.filter((s) => s.status === "recapture_required").length;
  const pendingSync = db.screenings.filter((s) => !s.synced).length;
  const synced = db.screenings.length - pendingSync;
  const patient = (id: string) => db.patients.find((p) => p.id === id);
  const recent = [...db.screenings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Nurse Dashboard"
        subtitle="Today's screening operations"
        action={
          <Link href="/nurse/verification" className={buttonStyles("gold")}>
            <Plus className="size-4" aria-hidden="true" /> Start new screening
          </Link>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Today's screenings" value={today.length} highlight />
        <StatCard label="Completed" value={n("completed")} />
        <StatCard label="Pending" value={n("pending")} />
        <StatCard label="In progress" value={n("in_progress")} />
        <StatCard label="Recapture required" value={recapture} hint="All open cases" />
        <StatCard label="Failed quality checks" value={failed} hint="Today" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="mb-4 font-display text-xl font-semibold text-deep">Recent patients</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-strong">
                  <th className="py-2 pr-3 font-semibold">Patient</th>
                  <th className="py-2 pr-3 font-semibold">Screening</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id} className="border-t border-deep/10">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-deep">{patient(s.patientId)?.name}</div>
                      <div className="text-xs text-muted-strong">{s.patientId}</div>
                    </td>
                    <td className="py-3 pr-3">{s.id}</td>
                    <td className="py-3 pr-3"><StatusBadge status={s.status} /></td>
                    <td className="py-3 text-muted-strong">{formatDateTime(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-xl font-semibold text-deep">Sync status</h2>
          <div
            className={`mb-5 flex items-center gap-3 rounded-xl p-3 text-sm font-medium ${
              online ? "bg-ok-bg text-ok" : "bg-gold-light text-warn"
            }`}
          >
            {online ? <Wifi className="size-5" aria-hidden="true" /> : <WifiOff className="size-5" aria-hidden="true" />}
            {online ? "Online" : "Offline mode: records are saved on this device"}
          </div>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-strong">Pending sync queue</dt><dd className="font-semibold text-deep">{pendingSync}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-strong">Successfully synced</dt><dd className="font-semibold text-deep">{synced}</dd></div>
          </dl>
          <Link href="/nurse/sync" className={`${buttonStyles("ghost")} mt-5 w-full`}>Open sync queue</Link>
        </Card>
      </div>

      <p className="mt-8 text-xs text-muted-strong">
        Sample data.{" "}
        <button type="button" onClick={resetDemo} className="font-medium text-navy underline underline-offset-4">Reset demo data</button>
      </p>
    </>
  );
}