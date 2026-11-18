"use client";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/db";
import { useMe } from "@/lib/me";

export default function Page() {
  const { ready, patient, screenings } = useMe();
  if (!ready) return null;
  if (!patient) return <Card>Patient record not found on this device.</Card>;
  return (
    <>
      <PageHeader title="My Screening History" subtitle="Every eye screening you have had." />
      <Card>
        {screenings.length === 0 && <p className="text-sm text-muted-strong">No screenings yet.</p>}
        <ul>
          {screenings.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-4 text-sm first:border-0">
              <div><strong className="text-deep">{formatDateTime(s.createdAt)}</strong><div className="text-xs text-muted-strong">{s.id}</div></div>
              <div className="flex items-center gap-3">
                {s.reportReleased ? <Badge tone="ok">Report ready</Badge> : s.sentToDoctor ? <Badge>With the doctor</Badge> : <Badge>In progress</Badge>}
                {s.reportReleased && <Link href={`/patient/report?id=${s.id}`} className="font-semibold text-navy underline underline-offset-4">View report</Link>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}