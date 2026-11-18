"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, homeFor } from "@/lib/auth";
import type { Role } from "@/lib/nav";
import { refreshAll } from "@/lib/remote"

export default function RoleGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

useEffect(() => {
    const s = getSession();
    if (!s) router.replace("/login");
    else if (s.role !== role) router.replace(homeFor(s.role));
    else { setOk(true); refreshAll(role); }
    const onOnline = () => refreshAll(role);
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => refreshAll(role), 30_000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(timer); };
  }, [role, router]);

  if (!ok) return <div className="grid min-h-screen place-items-center text-sm text-muted-strong">Loading…</div>;
  return <>{children}</>;
}