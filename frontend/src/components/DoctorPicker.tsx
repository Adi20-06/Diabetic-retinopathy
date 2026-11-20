"use client";
import { useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { getDoctors, type DoctorOpt } from "@/lib/db";

export default function DoctorPicker({ title = "Send to which doctor?", current, onSend, onCancel }: {
  title?: string; current?: string; onSend: (d: DoctorOpt) => void | Promise<void>; onCancel: () => void;
}) {
  const [list, setList] = useState<DoctorOpt[] | null>(null);
  const [pick, setPick] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { getDoctors().then(setList); }, []);
  const chosen = list?.find((d) => d.username === pick);
  return (
    <Card className="max-w-md">
      <h2 className="font-display text-xl font-semibold text-deep">{title}</h2>
      <p className="mt-1 text-sm text-muted-strong">Only the doctor you choose will see this case.</p>
      {!list ? <p className="mt-4 text-sm text-muted-strong">Loading doctors…</p>
        : list.length === 0 ? <p className="mt-4 text-sm text-danger">No doctor available. Ask your administrator to add one.</p> : (
        <ul className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Doctors">
          {list.map((d) => (
            <li key={d.username}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${pick === d.username ? "border-navy bg-gold-light/50" : "border-deep/10 hover:bg-page"}`}>
                <input type="radio" name="doctor" value={d.username} checked={pick === d.username} onChange={() => setPick(d.username)} className="size-5 accent-navy" />
                <Stethoscope className="size-4 text-muted-strong" aria-hidden="true" />
                <span><strong className="text-deep">{d.name}</strong> <span className="text-muted-strong">({d.username})</span></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex gap-3">
        <Button variant="gold" disabled={!chosen || busy} onClick={async () => { setBusy(true); await onSend(chosen!); setBusy(false); }}>
          {busy ? "Sending…" : chosen ? `Send to ${chosen.name}` : "Choose a doctor"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}