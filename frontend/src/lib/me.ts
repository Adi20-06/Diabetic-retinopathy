"use client";
import { useDb } from "./db";
import { useSession } from "./auth";

export function useMe() {
  const db = useDb();
  const session = useSession() as unknown as Record<string, unknown> | null;
  const pid = session ? String(session.userId ?? session.id ?? session.username ?? "") : "";
  const patient = db?.patients.find((p) => p.id === pid);
  const screenings = db ? db.screenings.filter((s) => s.patientId === pid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  return { ready: !!db, patient, screenings };
}