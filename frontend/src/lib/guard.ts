"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "./api";
import { getSession, homeFor, logout, refreshToken } from "./auth";
import type { Role } from "./nav";

const IDLE_MS = 15 * 60 * 1000, REFRESH_MS = 10 * 60 * 1000, LAST = "dr_last";

/** Returns true only once the server has confirmed this session. Render nothing until then. */
export function useSessionGuard(role: Role): boolean {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let dead = false;
    const out = (why = "") => { if (dead) return; dead = true; logout(); router.replace(`/login${why ? `?reason=${why}` : ""}`); };
    const check = () => {
      const s = getSession();
      if (!s) return out();
      if (s.role !== role) { router.replace(homeFor(s.role)); return false; }
      if (s.mustChange) { router.replace("/change-password"); return false; }
      return true;
    };
    if (!check()) return;

    api("/me").then(() => { if (!dead) setOk(true); }).catch((e) => {
      if (e instanceof ApiError && e.status === 401) out("expired");
      else if (e instanceof ApiError && e.status === 403) router.replace("/change-password");
      else if (!dead) setOk(true);       // server unreachable: the offline nurse app keeps working
    });

    const touch = () => { try { localStorage.setItem(LAST, String(Date.now())); } catch {} };
    touch();
    const evs = ["click", "keydown", "touchstart", "scroll"] as const;
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const tick = setInterval(() => {
      const last = Number(localStorage.getItem(LAST) ?? Date.now());
      if (navigator.onLine && Date.now() - last > IDLE_MS) return out("idle");   // offline: stay, because sign-in needs the server
    }, 30_000);
    const renew = setInterval(() => {
      const last = Number(localStorage.getItem(LAST) ?? 0);
      if (navigator.onLine && Date.now() - last < IDLE_MS) refreshToken().catch((e) => { if (e instanceof ApiError && e.status === 401) out("expired"); });
    }, REFRESH_MS);

    const onStorage = (e: StorageEvent) => { if (e.key === "dr_session") check(); };       // logged out in another tab
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) check(); };               // Back button after logout
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onShow);
    return () => {
      dead = true; clearInterval(tick); clearInterval(renew);
      evs.forEach((e) => window.removeEventListener(e, touch));
      window.removeEventListener("storage", onStorage); window.removeEventListener("pageshow", onShow);
    };
  }, [role, router]);

  return ok;
}