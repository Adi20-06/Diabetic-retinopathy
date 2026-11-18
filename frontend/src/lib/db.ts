"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { EyeAi } from "./mockAi";
import { getBlob, sha256 } from "./images";
import { api, ApiError } from "./api";

export type Patient = {
  id: string; name: string; dob: string; gender: string; mobile: string; history: string;
  registeredAt: string; registeredBy: string; verified: boolean; consent: boolean;
};
export type EyeState = "pending" | "captured" | "quality_failed" | "completed";
export type ScreeningStatus = "pending" | "in_progress" | "recapture_required" | "completed";
export type Eye = "right" | "left";
export type ImageMeta = {
  name: string; format: string; width: number; height: number; size: number; checksum: string;
  capturedAt: string; source: "upload" | "camera"; originalKey: string; processingKey: string;
  url?: string; heatmapUrl?: string;
  clientId?: string;                                  // made on the device; lets the server block duplicates
  serverChecksum?: { right?: string; left?: string }; // images the server already holds
};
export type IqaCheckResult = {
  id: "blur" | "illumination" | "glare" | "centering" | "compression";
  ok: boolean; value: string; required: string; message: string;
};
export type IqaStored = { checksum: string; score: number; gradable: boolean; checks: IqaCheckResult[]; assessedAt: string };
export type Decision = "urgent_referral" | "routine_referral" | "follow_up" | "recapture";
export const DECISION_LABEL: Record<Decision, string> = {
  urgent_referral: "Urgent referral to ophthalmologist",
  routine_referral: "Routine referral",
  follow_up: "No referral, routine follow-up",
  recapture: "Recapture needed",
};
export type ReviewEntry = {
  at: string; by: string; decision: Decision;
  finalGrades: { right?: number; left?: number };
  overrides: boolean; notes: string; followUp: string;
};
export type Screening = {
  id: string; patientId: string; createdAt: string; operatorId: string; status: ScreeningStatus;
  right?: EyeState; left?: EyeState; failedChecks: number; synced: boolean;
  images?: { right?: ImageMeta; left?: ImageMeta };               // current image per eye
  captures?: { eye: Eye; attempt: number; meta: ImageMeta }[];     // every capture ever made (kept for audit)
  quality?: { right?: IqaStored; left?: IqaStored };
  sentToDoctor?: string;
  doctorReview?: "pending" | "reviewed";
  ai?: "queued" | "done";
  aiResult?: { right?: EyeAi; left?: EyeAi };
  reviewHistory?: ReviewEntry[];
  reportReleased?: string;
  syncState?: "syncing" | "failed" | "synced";
  syncedAt?: string;
  syncError?: string;
  syncAttempts?: number;
};
export type Db = { patients: Patient[]; screenings: Screening[] };

const KEY = "dr_db2";
const EVT = "dr-db-change";


function seed(): Db { 
  return { 
    patients: [], screenings: [] 
  };
}

function raw(): string {
  let v = localStorage.getItem(KEY);
  if (!v) {
    v = JSON.stringify(seed());
    localStorage.setItem(KEY, v);
  }
  return v;
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** null while loading on the server / first paint */
export function useDb(): Db | null {
  const s = useSyncExternalStore(subscribe, () => { try { return raw(); } catch { return ""; } }, () => "");
  return useMemo(() => (s ? (JSON.parse(s) as Db) : null), [s]);
}

function mutate(fn: (db: Db) => void) {
  const db = JSON.parse(raw()) as Db;
  fn(db);
  localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new Event(EVT));
}

export function resetDemo() {
  localStorage.setItem(KEY, JSON.stringify(seed()));
  window.dispatchEvent(new Event(EVT));
}

// ---------- helpers ----------
export const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export function ageFrom(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return a;
}

export function nextPatientId(db: Db): string {
  const max = Math.max(0, ...db.patients.map((p) => parseInt(p.id.slice(1)) || 0));
  return `P${String(max + 1).padStart(3, "0")}`;
}

export function searchPatients(db: Db, q: string): Patient[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return db.patients
    .filter((p) => p.id.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || p.mobile.includes(s))
    .slice(0, 8);
}

export function findDuplicates(db: Db, x: { name: string; dob: string; mobile: string }): Patient[] {
  return db.patients.filter(
    (p) => p.mobile === x.mobile || (p.name.toLowerCase() === x.name.trim().toLowerCase() && p.dob === x.dob)
  );
}

export type ServerPatient = {
  id: string; name: string; dob: string; gender: string; mobile: string;
  history?: string; verified: boolean; created_at?: string; registered_by?: string;
};
export const toPatient = (x: ServerPatient): Patient => ({
  id: x.id, name: x.name, dob: x.dob, gender: x.gender, mobile: x.mobile, history: x.history ?? "",
  registeredAt: x.created_at ?? new Date().toISOString(), registeredBy: x.registered_by ?? "", verified: x.verified, consent: true,
});

export function replacePatients(list: Patient[]) {
  mutate((db) => { db.patients = list; });
}

export async function addPatient(
  input: { name: string; dob: string; gender: string; mobile: string; history: string },
  force = false
): Promise<{ patient?: Patient; duplicates?: Patient[]; error?: string }> {
  try {
    const x = await api<ServerPatient>(`/patients?force=${force}`, { json: { ...input, id_verified: true, consent: true } });
    const p = toPatient(x);
    mutate((db) => { db.patients = [p, ...db.patients.filter((q) => q.id !== p.id)]; });
    return { patient: p };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.detail && typeof e.detail === "object")
      return { duplicates: ((e.detail as { matches: ServerPatient[] }).matches ?? []).map(toPatient) };
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

/** Returns an error message, or null on success. */
export async function markVerified(id: string): Promise<string | null> {
  try {
    const x = await api<ServerPatient>(`/patients/${id}/verify`, { method: "POST" });
    mutate((db) => { const p = db.patients.find((q) => q.id === id); if (p) p.verified = x.verified; });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Something went wrong.";
  }
}

export function createScreening(patientId: string, eyes: { right: boolean; left: boolean }, operatorId: string): Screening {
  let created!: Screening;
  mutate((db) => {
    created = {
      id: `LOCAL-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, clientId: crypto.randomUUID(),
      patientId, createdAt: new Date().toISOString(), operatorId,
      status: "pending", right: eyes.right ? "pending" : undefined, left: eyes.left ? "pending" : undefined,
      failedChecks: 0, synced: false,
    };
    db.screenings.push(created);
  });
  return created;
}

export function addEye(id: string, eye: Eye) {
  mutate((db) => {
    const s = db.screenings.find((x) => x.id === id);
    if (s && !s[eye]) { s[eye] = "pending"; s.synced = false; }
  });
}

export function saveEyeImage(id: string, eye: Eye, meta: ImageMeta) {
  mutate((db) => {
    const s = db.screenings.find((x) => x.id === id);
    if (!s) return;
    const log = s.captures ?? [];
    s.images = { ...s.images, [eye]: meta };
    s.captures = [...log, { eye, attempt: log.filter((c) => c.eye === eye).length + 1, meta }];
    s[eye] = "captured";
    s.status = "in_progress";
    s.synced = false;
  });
}

export function resetEye(id: string, eye: Eye) {
  mutate((db) => {
    const s = db.screenings.find((x) => x.id === id);
    if (!s) return;
    if (s.images) delete s.images[eye];
    if (s.quality) delete s.quality[eye];
    s[eye] = "pending";
    const failed = (["right", "left"] as Eye[]).some((e) => s[e] === "quality_failed");
    s.status = failed ? "recapture_required" : s.images?.right || s.images?.left ? "in_progress" : "pending";
    s.synced = false;
  });
}

export function saveQuality(id: string, eye: Eye, q: IqaStored) {
  mutate((db) => {
    const s = db.screenings.find((x) => x.id === id);
    if (s) s.quality = { ...s.quality, [eye]: q };
  });
}

export function acceptImage(id: string, eye: Eye) {
  mutate((db) => {
    const s = db.screenings.find((x) => x.id === id);
    if (!s || !s.quality?.[eye]?.gradable) return; // an ungradable image can never be accepted
    s[eye] = "completed";
    const chosen = (["right", "left"] as Eye[]).filter((e) => s[e]);
    if (chosen.every((e) => s[e] === "completed")) s.status = "completed";
    s.synced = false;
  });
}

export function rejectImage(id: string, eye: Eye) {
  mutate((db) => {
    const s = db.screenings.find((x) => x.id === id);
    if (!s) return;
    s[eye] = "quality_failed";
    s.status = "recapture_required";
    s.failedChecks += s.quality?.[eye]?.checks.filter((c) => !c.ok).length ?? 0;
    s.synced = false;
  });
}

export function sendToDoctor(id: string) {
  mutate((db) => {
    const s = db.screenings.find((x) => x.id === id);
    if (!s || s.status !== "completed") return;
    s.sentToDoctor = new Date().toISOString();
    s.doctorReview = "pending";
    s.ai = "queued";
    s.synced = false;
  });
}

// ---------- server types ----------
export type ServerEye = {
  eye: Eye; state: EyeState; capture_count?: number;
  quality?: { gradable: boolean; reasons?: string[] } | null;
  client_quality?: IqaStored | null;
  original_sha256?: string; processing_sha256?: string;
  image_url?: string; original_url?: string; heatmap_url?: string;
  ai?: { probs: number[]; grade: number; referable_prob: number; referable: boolean; entropy: number; uncertain: boolean } | null;
};
export type ServerReview = { by: string; decision: Decision; final_grades: { right?: number; left?: number }; overrides: boolean; notes: string; follow_up: string; at: string };
export type ServerScreening = {
  id: string; client_id: string | null; patient_id: string; operator?: string | null; status: ScreeningStatus;
  failed_checks: number; created_at: string; synced_at: string | null; sent_to_doctor: string | null;
  ai_state: "queued" | "done" | null; doctor_review: "pending" | "reviewed" | null; report_released: string | null;
  eyes: Partial<Record<Eye, ServerEye>>; reviews?: ServerReview[]; send_rejected?: string | null;
};
export type PatientView = {
  id: string; created_at: string; sent_at?: string | null; released_at?: string | null;
  stage: "in_progress" | "with_doctor" | "report_ready";
  report?: { decision: Decision; follow_up: string; final_grades: { right?: number; left?: number }; notes: string; by: string; at: string };
  eyes?: Partial<Record<Eye, { image_url: string; heatmap_url: string | null }>>;
};

// ---------- converters ----------
const CHECK_RX: [IqaCheckResult["id"], RegExp][] = [
  ["blur", /blurry/i], ["illumination", /dark|over-exposed/i], ["glare", /glare/i], ["centering", /centred/i], ["compression", /compress/i],
];

/** The server's gate is the authority; the device's measured values are kept only for display. */
export function qualityFromServer(e: ServerEye, fallbackAt: string): IqaStored | undefined {
  if (!e.quality) return undefined;
  const reasons = e.quality.reasons ?? [];
  const cq = e.client_quality;
  const checks: IqaCheckResult[] = CHECK_RX.map(([id, rx]) => {
    const bad = reasons.find((r) => rx.test(r));
    const c = cq?.checks.find((x) => x.id === id);
    return { id, ok: !bad, value: c?.value ?? "-", required: c?.required ?? "-", message: bad ?? c?.message ?? "" };
  });
  return { checksum: e.original_sha256 ?? "", score: cq?.score ?? (e.quality.gradable ? 100 : 0), gradable: e.quality.gradable, checks, assessedAt: cq?.assessedAt ?? fallbackAt };
}

const blankMeta = (checksum = "", url?: string, heatmapUrl?: string | null): ImageMeta => ({
  name: "", format: "", width: 0, height: 0, size: 0, checksum, capturedAt: "", source: "upload",
  originalKey: "", processingKey: "", url, heatmapUrl: heatmapUrl ?? undefined,
});

export function fromStaff(x: ServerScreening): Screening {
  const s: Screening = {
    id: x.id, clientId: x.client_id ?? undefined, patientId: x.patient_id, createdAt: x.created_at,
    operatorId: x.operator ?? "", status: x.status, failedChecks: x.failed_checks, synced: true,
    syncedAt: x.synced_at ?? undefined, sentToDoctor: x.sent_to_doctor ?? undefined,
    doctorReview: x.doctor_review ?? undefined, ai: x.ai_state ?? undefined, reportReleased: x.report_released ?? undefined,
    images: {}, quality: {}, aiResult: {}, captures: [], serverChecksum: {},
  };
  for (const eye of ["right", "left"] as Eye[]) {
    const e = x.eyes[eye];
    if (!e) continue;
    s[eye] = e.state;
    const meta = blankMeta(e.original_sha256, e.image_url, e.heatmap_url);
    s.images![eye] = meta;
    s.serverChecksum![eye] = e.original_sha256;
    const q = qualityFromServer(e, x.synced_at ?? x.created_at);
    if (q) s.quality![eye] = q;
    if (e.ai) s.aiResult![eye] = { probs: e.ai.probs, grade: e.ai.grade, referableProb: e.ai.referable_prob, referable: e.ai.referable, entropy: e.ai.entropy, uncertain: e.ai.uncertain };
    for (let i = 1; i <= (e.capture_count ?? 1); i++) s.captures!.push({ eye, attempt: i, meta });
  }
  s.reviewHistory = (x.reviews ?? []).map((v) => ({ at: v.at, by: v.by, decision: v.decision, finalGrades: v.final_grades, overrides: v.overrides, notes: v.notes, followUp: v.follow_up }));
  return s;
}

export function fromPatientView(x: PatientView, patientId: string): Screening {
  const s: Screening = { id: x.id, patientId, createdAt: x.created_at, operatorId: "", status: "completed", failedChecks: 0, synced: true, images: {} };
  if (x.stage !== "in_progress") { s.sentToDoctor = x.sent_at ?? x.created_at; s.doctorReview = x.stage === "report_ready" ? "reviewed" : "pending"; }
  if (x.report) {
    s.reportReleased = x.released_at ?? x.report.at;
    s.reviewHistory = [{ at: x.report.at, by: x.report.by, decision: x.report.decision, finalGrades: x.report.final_grades, overrides: false, notes: x.report.notes, followUp: x.report.follow_up }];
  }
  for (const eye of ["right", "left"] as Eye[]) {
    const e = x.eyes?.[eye];
    if (e) { s[eye] = "completed"; s.images![eye] = blankMeta("", e.image_url, e.heatmap_url); }
  }
  return s;
}

/** Local changes that have not been uploaded always win. Synced local records only take the server-owned fields. */
export function mergeServerScreenings(list: Screening[], role: "nurse" | "doctor" | "patient") {
  mutate((db) => {
    const out: Screening[] = [];
    const used = new Set<Screening>();
    for (const sv of list) {
      const l = db.screenings.find((x) => x.id === sv.id || (!!sv.clientId && x.clientId === sv.clientId));
      if (l) used.add(l);
      if (!l) out.push(sv);
      else if (!l.synced) out.push(l);
      else if (role === "nurse") out.push({ ...l, id: sv.id, status: sv.status, sentToDoctor: sv.sentToDoctor, doctorReview: sv.doctorReview, ai: sv.ai, reportReleased: sv.reportReleased });
      else out.push(sv);
    }
    for (const l of db.screenings) if (!used.has(l)) out.push(l);
    db.screenings = out;
  });
}

// ---------- the real sync ----------
const inflight = new Set<string>();

export async function syncScreening(id: string, opts: { fail?: boolean } = {}): Promise<"synced" | "failed" | "skipped"> {
  if (inflight.has(id)) return "skipped";
  const s0 = (JSON.parse(raw()) as Db).screenings.find((x) => x.id === id);
  if (!s0 || s0.synced || !s0.clientId || !(s0.images?.right || s0.images?.left)) return "skipped";
  inflight.add(id);
  const change = (fn: (s: Screening) => void) => mutate((db) => { const s = db.screenings.find((x) => x.id === id); if (s) fn(s); });
  try {
    change((s) => { s.syncState = "syncing"; s.syncError = undefined; });
    if (opts.fail) throw new Error("Server error, please retry");
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("No connection");

    const form = new FormData();
    const eyes: Record<string, unknown> = {};
    for (const eye of ["right", "left"] as Eye[]) {
      const meta = s0.images?.[eye];
      if (!meta) continue;
      const known = s0.serverChecksum?.[eye] === meta.checksum;      // server already has this image: send the checksum only
      let processingSha = "";
      if (!known) {
        const [orig, proc] = await Promise.all([getBlob(meta.originalKey), getBlob(meta.processingKey)]);
        if (!orig || !proc) throw new Error(`The ${eye} eye image is missing on this device`);
        processingSha = await sha256(proc);
        form.append(`${eye}_original`, orig, meta.name || `${eye}.jpg`);
        form.append(`${eye}_processing`, proc, `${eye}-processing.jpg`);
      }
      eyes[eye] = {
        state: s0[eye] ?? "captured", original_sha256: meta.checksum, processing_sha256: processingSha,
        capture_count: (s0.captures ?? []).filter((c) => c.eye === eye).length || 1, quality: s0.quality?.[eye] ?? null,
      };
    }
    form.append("payload", JSON.stringify({ client_id: s0.clientId, patient_id: s0.patientId, created_at: s0.createdAt, send_to_doctor: !!s0.sentToDoctor, eyes }));
    const r = await api<ServerScreening>("/sync/screenings", { form });

    change((s) => {
      s.id = r.id;                                            // the real ID replaces the temporary one
      s.status = r.status; s.failedChecks = r.failed_checks;
      s.synced = true; s.syncState = "synced"; s.syncedAt = r.synced_at ?? new Date().toISOString(); s.syncError = undefined;
      s.serverChecksum = { ...s.serverChecksum };
      for (const eye of ["right", "left"] as Eye[]) {
        const e = r.eyes[eye];
        if (!e) continue;
        s[eye] = e.state;                                     // the server's quality gate has the final say
        const q = qualityFromServer(e, s.syncedAt!);
        if (q) s.quality = { ...s.quality, [eye]: q };
        if (e.original_sha256) s.serverChecksum[eye] = e.original_sha256;
      }
      if (r.sent_to_doctor) { s.sentToDoctor = r.sent_to_doctor; s.doctorReview = r.doctor_review ?? "pending"; s.ai = r.ai_state ?? "queued"; }
      else { delete s.sentToDoctor; delete s.doctorReview; delete s.ai; }
    });
    return "synced";
  } catch (e) {
    change((s) => { s.syncState = "failed"; s.syncError = e instanceof Error ? e.message : "Sync failed"; s.syncAttempts = (s.syncAttempts ?? 0) + 1; });
    return "failed";
  } finally {
    inflight.delete(id);
  }
}

// ---------- doctor actions (the server enforces the rules) ----------
export async function saveDecision(id: string, e: Omit<ReviewEntry, "at">): Promise<void> {
  const x = await api<ServerScreening>(`/screenings/${id}/reviews`, {
    json: { decision: e.decision, final_grades: e.finalGrades, notes: e.notes, follow_up: e.followUp },
  });
  mergeServerScreenings([fromStaff(x)], "doctor");
}

export async function releaseReport(id: string): Promise<string | null> {
  try {
    mergeServerScreenings([fromStaff(await api<ServerScreening>(`/screenings/${id}/release`, { method: "POST" }))], "doctor");
    return null;
  } catch (e) { return e instanceof Error ? e.message : "Could not release the report"; }
}

/** On logout: remove everything that came from the server. Records still waiting to upload are kept. */
export function clearSyncedData() {
  try { mutate((db) => { db.patients = []; db.screenings = db.screenings.filter((s) => !s.synced); }); } catch {}
}

