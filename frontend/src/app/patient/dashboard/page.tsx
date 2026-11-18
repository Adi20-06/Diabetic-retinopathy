"use client";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge, Card, PageHeader, buttonStyles } from "@/components/ui";
import { DECISION_LABEL, formatDateTime } from "@/lib/db";
import { notesFor, usePatientData } from "@/lib/patientData";
import { useMe } from "@/lib/me";

export default function Page() {
  const { ready, patient, screenings } = useMe();
  const pd = usePatientData();
  if (!ready) return null;
  if (!patient) return <Card>Patient record not found on this device.</Card>;

  const last = screenings[0];
  const review = last?.reviewHistory?.[last.reviewHistory.length - 1];
  const mine = pd.appts.filter((a) => a.patientId === patient.id && a.status === "requested");
  const unread = notesFor(screenings, pd.appts.filter((a) => a.patientId === patient.id)).filter((n) => !pd.read.includes(n.id)).length;

  const steps = last ? [
    ["Screening done", last.createdAt],
    ["Sent to the doctor", last.sentToDoctor],
    ["Doctor reviewed", review?.at],
    ["Report ready", last.reportReleased],
  ] as [string, string | undefined][] : [];

  return (
    <>
      <PageHeader title={`Hello, ${patient.name.split(" ")[0]}`} subtitle={`Patient ID ${patient.id}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="font-display text-xl font-semibold text-deep">Latest screening</h2>
          {!last ? <p className="mt-3 text-sm text-muted-strong">You have no screenings yet. Visit your health centre to get screened.</p> : (
            <>
              <ol className="mt-4 flex flex-col gap-3">
                {steps.map(([label, at]) => (
                  <li key={label} className="flex items-center gap-3 text-sm">
                    {at ? <CheckCircle2 className="size-5 text-ok" aria-hidden="true" /> : <Circle className="size-5 text-muted" aria-hidden="true" />}
                    <span className={at ? "font-medium text-deep" : "text-muted-strong"}>{label}</span>
                    {at && <span className="text-xs text-muted-strong">{formatDateTime(at)}</span>}
                  </li>
                ))}
              </ol>
              {last.reportReleased && review ? (
                <div className="mt-5 rounded-xl bg-gold-light/60 p-4 text-sm text-deep">
                  <div className="font-display text-lg font-semibold">{DECISION_LABEL[review.decision]}</div>
                  <div>Follow-up: {review.followUp}</div>
                  <Link href={`/patient/report?id=${last.id}`} className={`${buttonStyles("primary")} mt-3`}>Open my report</Link>
                </div>
              ) : <p className="mt-5 text-sm text-muted-strong">Your result will appear here after the doctor has reviewed it.</p>}
            </>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="font-display text-xl font-semibold text-deep">Appointments</h2>
            <p className="mt-2 text-sm text-ink">{mine.length ? `${mine.length} requested` : "No upcoming appointments."}</p>
            <Link href="/patient/appointments" className="mt-3 inline-block text-sm font-semibold text-navy underline underline-offset-4">Manage appointments</Link>
          </Card>
          <Card>
            <h2 className="font-display text-xl font-semibold text-deep">Notifications</h2>
            <p className="mt-2 text-sm text-ink">{unread ? <Badge tone="danger">{unread} new</Badge> : "You are all caught up."}</p>
            <Link href="/patient/notifications" className="mt-3 inline-block text-sm font-semibold text-navy underline underline-offset-4">View notifications</Link>
          </Card>
        </div>
      </div>
    </>
  );
}