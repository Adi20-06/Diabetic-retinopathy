"use client";
import { useState } from "react";
import { Copy, Printer, KeyRound } from "lucide-react";
import { Button } from "@/components/ui";
import { resetPatientPassword } from "@/lib/db";

export function TempPasswordCard({ patientId, name, password, idLabel = "Patient ID" }: { patientId: string; name: string; password: string; idLabel?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(`ID: ${patientId}\nTemporary password: ${password}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <div className="mt-5 rounded-xl border-2 border-dashed border-gold bg-gold-light/40 p-4 print:border-solid">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-strong">Login for {name}</div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div><div className="text-xs text-muted-strong">{idLabel}</div><div className="font-mono text-xl font-semibold text-deep">{patientId}</div></div>
        <div><div className="text-xs text-muted-strong">Temporary password</div><div className="font-mono text-xl font-semibold text-deep">{password}</div></div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-deep">
        Give this to {name} now. <strong>It is shown only once.</strong> They must choose their own password the first time they sign in.
        If it is lost, use &quot;Reset password&quot; on the verification page.
      </p>
      <div className="mt-3 flex gap-2 print:hidden">
        <Button type="button" variant="ghost" onClick={copy}><Copy className="mr-1.5 size-4" aria-hidden="true" />{copied ? "Copied" : "Copy"}</Button>
        <Button type="button" variant="ghost" onClick={() => window.print()}><Printer className="mr-1.5 size-4" aria-hidden="true" />Print</Button>
      </div>
    </div>
  );
}

/** For the verification page: issues a new temporary password for a patient who forgot theirs. */
export function ResetPasswordButton({ patientId, name }: { patientId: string; name: string }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (!window.confirm(`Reset the password for ${name} (${patientId})? Their current password will stop working.`)) return;
    setBusy(true); setError("");
    const r = await resetPatientPassword(patientId);
    setBusy(false);
    if (r.error) setError(r.error); else setPw(r.tempPassword ?? "");
  }
  if (pw) return <TempPasswordCard patientId={patientId} name={name} password={pw} />;
  return (
    <div>
      <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
        <KeyRound className="mr-1.5 size-4" aria-hidden="true" />{busy ? "Resetting…" : "Reset password"}
      </Button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}