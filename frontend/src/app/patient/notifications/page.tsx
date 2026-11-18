"use client";
import { Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/db";
import { markRead, notesFor, usePatientData } from "@/lib/patientData";
import { useMe } from "@/lib/me";

export default function Page() {
  const { ready, patient, screenings } = useMe();
  const pd = usePatientData();
  if (!ready) return null;
  if (!patient) return <Card>Patient record not found on this device.</Card>;

  const notes = notesFor(screenings, pd.appts.filter((a) => a.patientId === patient.id));
  const unread = notes.filter((n) => !pd.read.includes(n.id));

  return (
    <>
      <PageHeader title="Notifications" action={<Button variant="ghost" disabled={unread.length === 0} onClick={() => markRead(unread.map((n) => n.id))}>Mark all as read</Button>} />
      <Card>
        {notes.length === 0 && <p className="text-sm text-muted-strong">Nothing yet.</p>}
        <ul>
          {notes.map((n) => {
            const isNew = !pd.read.includes(n.id);
            return (
              <li key={n.id} className="flex items-start gap-3 border-t border-deep/10 py-4 text-sm first:border-0">
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${isNew ? "bg-gold" : "bg-transparent"}`} aria-label={isNew ? "New" : undefined} />
                <div>
                  <div className={isNew ? "font-semibold text-deep" : "text-ink"}>{n.title}</div>
                  <div className="text-ink">{n.body}</div>
                  <div className="text-xs text-muted-strong">{formatDateTime(n.at)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}