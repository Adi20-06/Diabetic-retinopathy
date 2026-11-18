"use client";
import { useState } from "react";
import { Badge, Button, Card, PageHeader, inputClass } from "@/components/ui";
import { cancelAppointment, requestAppointment, usePatientData } from "@/lib/patientData";
import { useMe } from "@/lib/me";

const REASONS = ["Eye specialist visit", "Follow-up screening", "Question about my report"];

export default function Page() {
  const { ready, patient } = useMe();
  const pd = usePatientData();
  const today = new Date().toLocaleDateString("en-CA");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [error, setError] = useState("");
  if (!ready) return null;
  if (!patient) return <Card>Patient record not found on this device.</Card>;

  const mine = pd.appts.filter((a) => a.patientId === patient.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function submit() {
    if (!date || date < today) return setError("Choose a date from today onwards.");
    setError("");
    try { await requestAppointment(patient!.id, date, reason); setDate(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not request the appointment."); }
  }

  return (
    <>
      <PageHeader title="Appointments" subtitle="Ask the health centre for a visit." />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <h2 className="font-display text-xl font-semibold text-deep">Request an appointment</h2>
          <label className="mt-4 block text-sm font-medium text-deep">Preferred date
            <input type="date" min={today} className={`${inputClass} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="mt-4 block text-sm font-medium text-deep">Reason
            <select className={`${inputClass} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          <Button variant="gold" className="mt-5" onClick={submit}>Request appointment</Button>
        </Card>

        <Card>
          <h2 className="font-display text-xl font-semibold text-deep">Your requests</h2>
          {mine.length === 0 ? <p className="mt-3 text-sm text-muted-strong">No appointments yet.</p> : (
            <ul className="mt-2">
              {mine.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm first:border-0">
                  <div><strong className="text-deep">{a.date}</strong><div className="text-xs text-muted-strong">{a.reason} · {a.id}</div></div>
                  <div className="flex items-center gap-3">
                    {a.status === "requested" ? <Badge>Requested</Badge> : a.status === "confirmed" ? <Badge tone="ok">Confirmed</Badge> : <Badge tone="danger">Cancelled</Badge>}
                    {a.status !== "cancelled" && <Button variant="ghost" className="h-9 px-3" onClick={() => cancelAppointment(a.id)}>Cancel</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}