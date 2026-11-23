"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

const COMMON = ["/login", "/change-password", "/privacy"];
const PROD = process.env.NODE_ENV === "production";     // not in `npm run dev`, where caching would hide your code changes

function roleHint() {
  const m = document.cookie.match(/(?:^|; )dr_role=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function RegisterSW() {
  const path = usePathname();

  useEffect(() => {
    if (PROD && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {                                       // once per tab per role, while online and signed in
    if (!PROD || !("serviceWorker" in navigator) || !navigator.onLine) return;
    const role = roleHint();
    if (!role) return;
    try { if (sessionStorage.getItem("dr_warm") === role) return; } catch {}
    navigator.serviceWorker.ready.then((reg) => {
      const items = ((NAV as Record<string, { href: string }[]>)[role] ?? []).map((i) => i.href);
      reg.active?.postMessage({ type: "warm", urls: [...new Set([...COMMON, ...items])] });
      try { sessionStorage.setItem("dr_warm", role); } catch {}
    });
  }, [path]);

  return null;
}