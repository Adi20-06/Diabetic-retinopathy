"use client";
import { useEffect, useState } from "react";
import { Download, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button, Card, PageHeader, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime, useDb, type Eye } from "@/lib/db";

type Row = { id: number; ts: string; action: string; screening_id: string | null; detail: Record<string, unknown> | null; hash: string };
type Chain = { valid: boolean; broken_at_id?: number };

export default function Page() {
  const db = useDb();
  const [rows, setRows] = useState<Row[]>([]);
  const [chain, setChain] = useState<Chain | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    Promise.all([api<Row[]>("/audit?limit=500"), api<Chain>("/audit/verify")])
      .then(([r, c]) => { setRows(r); setChain(c); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the audit log"));
  }, []);

  if (!db) return null;
  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => !term || `${r.action} ${r.screening_id ?? ""} ${JSON.stringify(r.detail)}`.toLowerCase().includes(term));
  const lineage = db.screenings.flatMap((s) => (["right", "left"] as Eye[]).filter((e) => s.images?.[e]?.checksum).map((e) => ({ s, e, sha: s.images![e]!.checksum })));

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["id,time,screening,action,detail,hash", ...shown.map((r) => [String(r.id), r.ts, r.screening_id ?? "", r.action, JSON.stringify(r.detail ?? {}), r.hash].map(esc).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "audit-trail.csv";
    a.click();
  }

  return (
    <>
      <PageHeader title="Audit Trail" subtitle="Every action is recorded in a tamper-evident chain." action={<Button variant="ghost" onClick={exportCsv}><Download className="size-4" aria-hidden="true" /> Export CSV</Button>} />
      {error && <p role="alert" className="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      {chain && (
        <div role="status" className={`mb-6 flex items-center gap-3 rounded-xl p-4 text-sm ${chain.valid ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger"}`}>
          {chain.valid ? <ShieldCheck className="size-5" aria-hidden="true" /> : <ShieldAlert className="size-5" aria-hidden="true" />}
          {chain.valid ? "Chain verified: no record has been changed or removed." : `Chain broken at record #${chain.broken_at_id}. The log was altered after it was written.`}
        </div>
      )}

      <Card className="overflow-x-auto">
        <input className={`${inputClass} mb-4 max-w-sm`} placeholder="Filter by screening, user or action" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter audit events" />
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="text-xs uppercase tracking-wide text-muted-strong"><th className="py-2">#</th><th className="py-2">Time</th><th className="py-2">Screening</th><th className="py-2">User</th><th className="py-2">Action</th><th className="py-2">Detail</th><th className="py-2">Hash</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const { by, ...rest } = (r.detail ?? {}) as Record<string, unknown>;
              return (
                <tr key={r.id} className="border-t border-deep/10 align-top">
                  <td className="py-3 text-muted-strong">{r.id}</td>
                  <td className="py-3 text-muted-strong">{formatDateTime(r.ts)}</td>
                  <td className="py-3 font-medium text-deep">{r.screening_id ?? "-"}</td>
                  <td className="py-3">{String(by ?? "system")}</td>
                  <td className="py-3 font-medium text-deep">{r.action.replace(/_/g, " ")}</td>
                  <td className="max-w-xs break-words py-3 text-xs text-ink">{Object.keys(rest).length ? JSON.stringify(rest).slice(0, 160) : ""}</td>
                  <td className="py-3 font-mono text-xs text-muted-strong" title={r.hash}>{r.hash.slice(0, 10)}…</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-strong">No events.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 overflow-x-auto">
        <h2 className="font-display text-xl font-semibold text-deep">Image lineage and checksums</h2>
        <p className="mt-1 text-sm text-muted-strong">The original image is stored unchanged. The processing copy and the AI input are made from it, and the SHA-256 of the original identifies the whole chain.</p>
        <table className="mt-3 w-full min-w-[720px] text-left text-sm">
          <thead><tr className="text-xs uppercase tracking-wide text-muted-strong"><th className="py-2">Screening</th><th className="py-2">Eye</th><th className="py-2">SHA-256 (original)</th><th className="py-2">Chain</th></tr></thead>
          <tbody>{lineage.map(({ s, e, sha }) => (
            <tr key={s.id + e} className="border-t border-deep/10">
              <td className="py-3 font-medium text-deep">{s.id}</td><td className="py-3">{e === "right" ? "OD" : "OS"}</td>
              <td className="py-3 font-mono text-xs text-ink" title={sha}>{sha.slice(0, 24)}…</td>
              <td className="py-3 text-ink">Original → processing copy → {s.aiResult?.[e] ? "AI prediction" : "AI pending"} → {s.reviewHistory?.length ? "doctor review" : "review pending"}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </>
  );
}