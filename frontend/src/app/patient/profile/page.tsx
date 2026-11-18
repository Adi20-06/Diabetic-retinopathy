"use client";
import { Card, PageHeader } from "@/components/ui";
import { ageFrom } from "@/lib/db";
import { useMe } from "@/lib/me";

export default function Page() {
  const { ready, patient } = useMe();
  if (!ready) return null;
  if (!patient) return <Card>Patient record not found on this device.</Card>;
  return (
    <>
      <PageHeader title="My Profile" subtitle="Your details as held by the health centre." />
      <Card>
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          {[["Name", patient.name], ["Patient ID", patient.id], ["Date of birth", patient.dob], ["Age", String(ageFrom(patient.dob) ?? "?")], ["Gender", patient.gender], ["Mobile", patient.mobile]].map(([k, v]) => (
            <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-strong">{k}</dt><dd className="mt-1 font-display text-lg font-semibold text-deep">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-6 rounded-xl bg-page p-4 text-sm text-ink">To correct any detail, please ask the health worker at your next visit. Your records are kept private and are shared only with your care team.</p>
      </Card>
    </>
  );
}