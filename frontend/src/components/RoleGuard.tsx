"use client";
import { useEffect } from "react";
import { refreshAll } from "@/lib/remote";
import { useSessionGuard } from "@/lib/guard";
import type { Role } from "@/lib/nav";

export default function RoleGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const ready = useSessionGuard(role);      // server-verified session, role, forced password change, idle logout

  useEffect(() => {
    if (!ready) return;
    refreshAll(role);
    const onOnline = () => refreshAll(role);
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => refreshAll(role), 30_000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(timer); };
  }, [ready, role]);

  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-muted-strong">Loading…</div>;
  return <>{children}</>;
}