"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "./nav";
import { api, ApiError } from "./api";
import { clearSyncedData } from "./db";
import { setAppts } from "./patientData";

export type Session = { id: string; name: string; role: Role; token: string; mustChange?: boolean; centre?: string };
type Reply = {
  token: string; role: Role; name: string; username: string; patient_id: string | null;
  must_change: boolean; centre_id: string | null; centre_name: string | null;
};

const SESSION_KEY = "dr_session";
export const homeFor = (role: Role) => (role === "admin" ? "/admin/staff" : `/${role}/dashboard`);

function save(r: Reply): Session {
  const s: Session = {
    id: r.patient_id ?? r.username, name: r.name, role: r.role, token: r.token,
    mustChange: r.must_change, centre: r.centre_name ?? undefined,
  };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  return s;
}

export function getSession(): Session | null {
  try {
    const v = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return v?.token ? v : null;
  } catch { return null; }
}

/** One login for everyone: the server tells us the role. null = wrong ID or password. */
export async function login(username: string, password: string): Promise<Session | null> {
  try {
    return save(await api<Reply>("/auth/login", { json: { username: username.trim(), password } }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;                       // e.g. 423 "Too many wrong attempts" is shown as the message
  }
}

/** Throws with the server's message (wrong current password, weak new password, ...). */
export async function changePassword(oldPw: string, newPw: string): Promise<Session> {
  return save(await api<Reply>("/auth/change-password", { json: { old_password: oldPw, new_password: newPw } }));
}

export function logout() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  clearSyncedData();
  setAppts([]);
}

/** undefined = still loading, null = not signed in. Also forces the change-password page while the password is temporary. */
export function useSession(): Session | null | undefined {
  const [s, setS] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  useEffect(() => {
    const v = getSession();
    setS(v);
    if (v?.mustChange && window.location.pathname !== "/change-password") router.replace("/change-password");
  }, [router]);
  return s;
}