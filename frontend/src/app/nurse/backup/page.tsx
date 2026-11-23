"use client";
import { useCallback, useEffect, useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/db";
import { useOnline } from "@/lib/online";

type Status = {
  running: boolean;
  last: { at: string; ok: boolean; verified: boolean; by: string; seconds: number } | null;
  backups: { name: string; at: string; size_mb: number }[];
};

export default function Page() {
  const online = useOnline();
  const [st, setSt] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const load = useCallback(
    () => api<Status>("/backup/status").then(setSt).catch((e) => setError(e instanceof Error ? e.message : "Could not load the backup status")),
    [],
  );

  useEffect(() => {                          // check often while a backup runs, otherwise now and then
    if (!online) return;
    load();
    const t = setInterval(load, st?.running ? 3000 : 30000);
    return () => clearInterval(t);
  }, [online, load, st?.running]);

  async function start() {
    setError(""); setStarting(true);
    try { await api("/backup/run", { method: "POST" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not start the backup."); }
    finally { setStarting(false); }
  }

  const busy = starting || !!st?.running;

  return (
    <>
      <PageHeader title="Backup" subtitle="Save a safe copy of all patient data and images on the server." />
      {error && <p role="alert" className="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl text-sm text-ink">
            <p>A backup copies the whole database and every image. It takes from a few seconds to a few minutes, and the app keeps working meanwhile.</p>
            <p className="mt-2 text-muted-strong">Backups stay on the server. They cannot be downloaded or restored from here; the administrator does that.</p>
          </div>
          <Button variant="gold" onClick={start} disabled={busy || !online}>
            {busy ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : <Database className="size-4" aria-hidden="true" />}
            {busy ? "Backing up…" : "Back up now"}
          </Button>
        </div>
        {!online && <p className="mt-4 text-sm text-warn">You are offline. Backups need a connection to the server.</p>}

        {st?.last && !st.running && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink">
            Last backup by {st.last.by}, {formatDateTime(st.last.at)} ({st.last.seconds} s):
            {st.last.ok && st.last.verified && <Badge tone="ok">Saved and verified</Badge>}
            {st.last.ok && !st.last.verified && <Badge>Saved, but the check failed. Tell the administrator</Badge>}
            {!st.last.ok && <Badge tone="danger">Failed. Tell the administrator</Badge>}
          </p>
        )}
      </Card>

      <Card className="mt-6 overflow-x-auto">
        <h2 className="font-display text-xl font-semibold text-deep">Recent backups</h2>
        <table className="mt-3 w-full min-w-[420px] text-left text-sm">
          <thead><tr className="text-xs uppercase tracking-wide text-muted-strong"><th className="py-2">Made</th><th className="py-2">Name</th><th className="py-2">Size</th></tr></thead>
          <tbody>
            {(st?.backups ?? []).map((b) => (
              <tr key={b.name} className="border-t border-deep/10">
                <td className="py-3 text-deep">{formatDateTime(b.at)}</td>
                <td className="py-3 font-mono text-xs text-ink">{b.name}</td>
                <td className="py-3 text-ink">{b.size_mb} MB</td>
              </tr>
            ))}
            {st && st.backups.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-strong">No backups yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}