"use client";
import { useSyncExternalStore } from "react";
import type { Screening } from "./db";
import { api } from "./api";

export type Appt = { id: string; patientId: string; date: string; reason: string; status: "requested" | "confirmed" | "cancelled"; createdAt: string };
type Data = { appts: Appt[]; read: string[] };

const KEY = "dr_pd", EVT = "dr-pd-change";
const EMPTY: Data = { appts: [], read: [] };
let cache: Data = EMPTY, raw = "";

function snap(): Data {
  try {
    const r = localStorage.getItem(KEY) ?? "";
    if (r !== raw) { raw = r; cache = r ? (JSON.parse(r) as Data) : EMPTY; }
  } catch { /* storage blocked: keep the last value */ }
  return cache;
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
}
function save(d: Data) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVT));
}

export function usePatientData(): Data {
  return useSyncExternalStore(subscribe, snap, () => EMPTY);
}

type ServerAppt = { id: string; patient_id: string; date: string; reason: string; status: "requested" | "confirmed" | "cancelled"; created_at: string };
const toAppt = (a: ServerAppt): Appt => ({ id: a.id, patientId: a.patient_id, date: a.date, reason: a.reason, status: a.status, createdAt: a.created_at });

export function setAppts(list: Appt[]) { save({ ...snap(), appts: list }); }
export async function refreshAppts() { setAppts((await api<ServerAppt[]>("/appointments")).map(toAppt)); }

export async function requestAppointment(_patientId: string, date: string, reason: string) {
  await api("/appointments", { json: { date, reason } });   // the server knows who you are from the token
  await refreshAppts();
}

export async function confirmAppointment(id: string) {
  await api(`/appointments/${id}/confirm`, { method: "POST" });
  await refreshAppts();
}

export async function cancelAppointment(id: string) {
  try { await api(`/appointments/${id}/cancel`, { method: "POST" }); await refreshAppts(); } catch { /* shown as unchanged */ }
}
export function markRead(ids: string[]) {
  const d = snap();
  save({ ...d, read: Array.from(new Set([...d.read, ...ids])) });
}

export type Note = { id: string; at: string; title: string; body: string };

export function notesFor(screenings: Screening[], appts: Appt[]): Note[] {
  const out: Note[] = [];
  for (const s of screenings) {
    out.push({ id: `scr-${s.id}`, at: s.createdAt, title: "Screening recorded", body: `Your eye screening ${s.id} was recorded.` });
    if (s.sentToDoctor) out.push({ id: `snt-${s.id}`, at: s.sentToDoctor, title: "Sent to the doctor", body: "A doctor will review your eye images." });
    if (s.reportReleased) out.push({ id: `rpt-${s.id}`, at: s.reportReleased, title: "Your report is ready", body: "Open My Report to see the doctor's result and follow-up advice." });
  }
  for (const a of appts) out.push({ id: `apt-${a.id}-${a.status}`, at: a.createdAt, title: a.status === "cancelled" ? "Appointment cancelled" : a.status === "confirmed" ? "Appointment confirmed" : "Appointment requested", body: `${a.reason} on ${a.date}` });
  return out.sort((x, y) => y.at.localeCompare(x.at));
}

export const PLAIN_GRADE = [
  "No signs of diabetic eye disease",
  "Mild changes",
  "Moderate changes",
  "Severe changes",
  "Advanced changes",
];