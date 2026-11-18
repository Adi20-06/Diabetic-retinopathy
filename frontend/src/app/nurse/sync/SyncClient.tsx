"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { formatDateTime, syncScreening, useDb, type Screening } from "@/lib/db";
import { useOnline } from "@/lib/online";

export default function SyncClient() {
  const db = useDb();
  const online = useOnline();
  const [auto, setAuto] = useState(true);
  const [simulateFail, setSimulateFail] = useState(false);
  const [run, setRun] = useState<{ total: number; done: number } | null>(null);
  const running = useRef(false);
  const wasOnline = useRef(online);

  const pending: Screening[] = db ? db.screenings.filter((s) => !s.synced) : [];
  const failed = pending.filter((s) => s.syncState === "failed");
  const last = db?.screenings.map((s) => s.syncedAt).filter(Boolean).sort().pop();

  async function syncAll(ids: string[]) {
    if (running.current || ids.length === 0) return;
    running.current = true;
    setRun({ total: ids.length, done: 0 });
    for (let i = 0; i < ids.length; i++) {
      await syncScreening(ids[i], { fail: simulateFail });
      setRun({ total: ids.length, done: i + 1 });
    }
    running.current = false;
    setTimeout(() => setRun(null), 1500);
  }

  // Automatic sync: when the connection returns, upload whatever is waiting.
  useEffect(() => {
    if (online && !wasOnline.current && auto) syncAll(pending.map((s) => s.id));
    wasOnline.current = online;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  if (!db) return null;

  const stateBadge = (s: Screening) =>
    s.syncState === "syncing" ? <Badge>Syncing…</Badge>
    : s.syncState === "failed" ? <Badge tone="danger">Failed</Badge>
    : <Badge>Pending</Badge>;

  const synced = db.screenings.filter((s) => s.synced).sort((a, b) => (b.syncedAt ?? "").localeCompare(a.syncedAt ?? "")).slice(0, 5);

  return (
    <>
      <PageHeader title="Offline Queue & Sync" subtitle="Records are stored on this device and uploaded when a connection is available." />

      {failed.length > 0 && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl bg-danger-bg p-4 text-danger">
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <div className="text-sm"><strong>{failed.length} record{failed.length > 1 ? "s" : ""} failed to sync.</strong> They are still saved on this device. Check the connection and retry.</div>
        </div>
      )}

      <Card>
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-strong">Connection</div>
            <div className="mt-1 flex items-center gap-2 font-display text-lg font-semibold text-deep">
              {online ? <Wifi className="size-5 text-ok" aria-hidden="true" /> : <WifiOff className="size-5 text-danger" aria-hidden="true" />}
              {online ? "Online" : "Offline"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-strong">Waiting to sync</div>
            <div className="mt-1 font-display text-lg font-semibold text-deep">{pending.length}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-strong">Last successful sync</div>
            <div className="mt-1 font-display text-lg font-semibold text-deep">{last ? formatDateTime(last) : "Never"}</div>
          </div>
        </div>

        {run && (
          <div className="mt-5" aria-live="polite">
            <div className="mb-1 flex justify-between text-xs text-muted-strong"><span>Syncing…</span><span>{run.done} / {run.total}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-page"><div className="h-full bg-gold transition-all" style={{ width: `${(run.done / run.total) * 100}%` }} /></div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-deep/10 pt-5">
          <Button variant="gold" disabled={!online || pending.length === 0 || !!run} onClick={() => syncAll(pending.map((s) => s.id))}>
            <RefreshCw className="size-4" aria-hidden="true" /> Sync all now
          </Button>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Sync automatically when online</label>
          <label className="flex items-center gap-2 text-sm text-muted-strong"><input type="checkbox" checked={simulateFail} onChange={(e) => setSimulateFail(e.target.checked)} /> Demo: simulate server failure</label>
        </div>
        {!online && <p className="mt-3 text-xs text-muted-strong">You are offline. Screening still works and everything is saved locally.</p>}
      </Card>

      <Card className="mt-6">
        <h2 className="font-display text-xl font-semibold text-deep">Pending queue</h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted-strong">Everything is synced.</p>
        ) : (
          <ul className="mt-2">
            {pending.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm first:border-0">
                <div>
                  <strong className="text-deep">{s.id}</strong>
                  <span className="text-muted-strong"> · {db.patients.find((p) => p.id === s.patientId)?.name} · {formatDateTime(s.createdAt)}</span>
                  {s.syncError && <div className="mt-1 text-xs text-danger">{s.syncError} (attempt {s.syncAttempts})</div>}
                </div>
                <div className="flex items-center gap-3">
                  {stateBadge(s)}
                  <Button variant="ghost" className="h-9 px-3" disabled={!online || s.syncState === "syncing"} onClick={() => syncScreening(s.id, { fail: simulateFail })}>
                    {s.syncState === "failed" ? "Retry" : "Sync"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="font-display text-xl font-semibold text-deep">Recently synced</h2>
        {synced.length === 0 ? <p className="mt-3 text-sm text-muted-strong">Nothing synced yet.</p> : (
          <ul className="mt-2">
            {synced.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-t border-deep/10 py-3 text-sm first:border-0">
                <span><strong className="text-deep">{s.id}</strong> <span className="text-muted-strong">· {s.syncedAt ? formatDateTime(s.syncedAt) : "earlier"}</span></span>
                <Badge tone="ok">Synced</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}