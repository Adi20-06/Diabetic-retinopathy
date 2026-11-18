"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime, useDb } from "@/lib/db";
import { confirmAppointment, refreshAppts, usePatientData } from "@/lib/patientData";

export default function AppointmentsBoard() {
  const db = useDb();
  const pd = usePatientData();
  const [show, setShow] = useState<"requested" | "all">("requested");
  const [error, setError] = useState("");

  useEffect(() => {                       // load now, then check for new requests every 30 seconds
    const go = () => refreshAppts().catch(() => {});
    go();
    const t = setInterval(go, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!db) return null;

  const waiting = pd.appts.filter((a) => a.status === "requested").length;
  const rows = pd.appts
    .filter((a) => show === "all" || a.status === "requested")
    .sort((a, b) => a.date.localeCompare(b.date));

  async function confirm(id: string) {
    setError("");
    try { await confirmAppointment(id); } catch (e) { setError(e instanceof Error ? e.message : "Could not confirm."); }
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle={`${waiting} request${waiting === 1 ? "" : "s"} waiting for confirmation.`}
        action={<Button variant="ghost" onClick={() => refreshAppts().catch((e) => setError(e.message))}><RefreshCw className="size-4" aria-hidden="true" /> Refresh</Button>}
      />
      <Card className="overflow-x-auto">
        <div className="mb-4 flex gap-2" role="tablist" aria-label="Filter">
          {(["requested", "all"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={show === k} onClick={() => setShow(k)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${show === k ? "bg-navy text-white" : "bg-white text-ink ring-1 ring-deep/10 hover:bg-page"}`}>
              {k === "requested" ? "Waiting" : "All"}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-strong">
              <th className="py-2">Preferred date</th><th className="py-2">Patient</th><th className="py-2">Mobile</th>
              <th className="py-2">Reason</th><th className="py-2">Requested</th><th className="py-2">Status</th><th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const p = db.patients.find((x) => x.id === a.patientId);
              return (
                <tr key={a.id} className="border-t border-deep/10">
                  <td className="py-3 font-semibold text-deep">{a.date}</td>
                  <td className="py-3 text-deep">{p?.name ?? "Unknown"} <span className="text-muted-strong">({a.patientId})</span></td>
                  <td className="py-3 text-ink">{p?.mobile ?? "-"}</td>
                  <td className="py-3 text-ink">{a.reason}</td>
                  <td className="py-3 text-muted-strong">{formatDateTime(a.createdAt)}</td>
                  <td className="py-3">
                    {a.status === "requested" ? <Badge>Requested</Badge> : a.status === "confirmed" ? <Badge tone="ok">Confirmed</Badge> : <Badge tone="danger">Cancelled</Badge>}
                  </td>
                  <td className="py-3 text-right">
                    {a.status === "requested" && <Button variant="gold" className="h-9 px-3" onClick={() => confirm(a.id)}>Confirm</Button>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-strong">No appointment requests.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}