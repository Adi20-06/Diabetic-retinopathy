"use client";
import { useEffect, useState } from "react";
import type { Role } from "./nav";
import { api, ApiError } from "./api";
import { clearSyncedData } from "./db";
import { setAppts } from "./patientData";

export type Session = { id: string; name: string; role: Role; token: string };
type Reply = { token: string; role: Role; name: string; username: string; patient_id: string | null };

const SESSION_KEY = "dr_session";
export const DEMO_OTP = "123456";

// Only used for the hint box on the login page. Real checking happens on the server.
const DEMO: Record<Role, { username: string; password: string; mobile: string }> = {
  patient: { username: "P001", password: "patient123", mobile: "9876500001" },
  nurse: { username: "nurse1", password: "nurse123", mobile: "" },
  doctor: { username: "doctor1", password: "doctor123", mobile: "" },
};
export const demoFor = (role: Role) => DEMO[role];
export const homeFor = (role: Role) => `/${role}/dashboard`;

function save(r: Reply): Session {
  const s: Session = { id: r.patient_id ?? r.username, name: r.name, role: r.role, token: r.token };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  return s;
}

export function getSession(): Session | null {
  try {
    const v = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return v?.token ? v : null;           // an old session without a token counts as signed out
  } catch { return null; }
}

/** null = wrong ID or password. Throws if the server cannot be reached. */
export async function login(role: Role, username: string, password: string): Promise<Session | null> {
  try {
    const r = await api<Reply>("/auth/login", { json: { username: username.trim(), password } });
    return r.role === role ? save(r) : null;      // right password but wrong portal tab = refused
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function loginWithOtp(mobile: string, otp: string): Promise<Session | null> {
  try {
    return save(await api<Reply>("/auth/otp-login", { json: { mobile: mobile.trim(), otp } }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export async function registerPatient(d: { name: string; dob: string; gender: string; mobile: string; password: string }): Promise<{ session?: Session; error?: string }> {
  try {
    const { patient_id } = await api<{ patient_id: string }>("/auth/register", { json: { ...d, consent: true } });
    const s = await login("patient", patient_id, d.password);
    return s ? { session: s } : { error: "Account created. Please sign in." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export function logout() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  clearSyncedData();   // server data does not stay on a shared device
  setAppts([]);
}

/** undefined = still loading, null = not signed in */
export function useSession(): Session | null | undefined {
  const [s, setS] = useState<Session | null | undefined>(undefined);
  useEffect(() => setS(getSession()), []);
  return s;
}