"use client";
import { useEffect, useState } from "react";
import { useDb } from "./db";
import { refreshAll } from "./remote";
import { useSession } from "./auth";

export function useMe() {
  const db = useDb();
  const session = useSession() as unknown as Record<string, unknown> | null;
  const pid = session ? String(session.userId ?? session.id ?? session.username ?? "") : "";
  const patient = db?.patients.find((p) => p.id === pid);
  const screenings = db ? db.screenings.filter((s) => s.patientId === pid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  // If this device does not have the patient's record yet (first sign-in after a password change), fetch it once.
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  useEffect(() => {
    if (!db || !pid || patient || state !== "idle") return;
    setState("loading");
    refreshAll("patient").catch(() => {}).finally(() => setState("done"));
  }, [db, pid, patient, state]);

  // "not ready" while loading, so the pages show nothing instead of a wrong "not found"
  return { ready: !!db && (!!patient || state === "done"), patient, screenings };
}