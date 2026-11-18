"use client";
import { api } from "./api";
import { getSession } from "./auth";
import { fromPatientView, fromStaff, mergeServerScreenings, replacePatients, toPatient, type PatientView, type ServerPatient, type ServerScreening } from "./db";
import { refreshAppts } from "./patientData";
import type { Role } from "./nav";

export async function refreshAll(role: Role) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  try {
    if (role === "patient") {
      const pid = getSession()?.id;
      if (pid) mergeServerScreenings((await api<PatientView[]>(`/patients/${pid}/screenings`)).map((x) => fromPatientView(x, pid)), role);
    } else {
      replacePatients((await api<ServerPatient[]>("/patients")).map(toPatient));
      mergeServerScreenings((await api<ServerScreening[]>("/screenings?full=true")).map(fromStaff), role);
    }
    await refreshAppts();
  } catch { /* offline or server down: keep the cached copy */ }
}