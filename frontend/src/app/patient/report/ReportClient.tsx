"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Button, Card, PageHeader } from "@/components/ui";
import { DECISION_LABEL, formatDateTime, type Eye } from "@/lib/db";
import { PLAIN_GRADE } from "@/lib/patientData";
import { useMe } from "@/lib/me";
import GradcamViewer from "@/components/GradcamViewer";

const LABEL: Record<Eye, string> = { right: "Right eye", left: "Left eye" };

export default function ReportClient() {
  const { ready, patient, screenings } = useMe();
  const id = useSearchParams().get("id");
  if (!ready) return null;
  if (!patient) return <Card>Patient record not found on this device.</Card>;

  const released = screenings.filter((s) => s.reportReleased && s.reviewHistory?.length);
  const s = released.find((x) => x.id === id) ?? (id ? undefined : released[0]);

  if (!s) {
    return (
      <>
        <PageHeader title="My Report" />
        <Card>
          <p className="text-sm text-muted-strong">{id ? "This report is not available." : "No report is ready yet. It appears after the doctor has reviewed your screening."}</p>
          <Link href="/patient/history" className="mt-3 inline-block text-sm font-semibold text-navy underline underline-offset-4">Back to history</Link>
        </Card>
      </>
    );
  }

  const last = s.reviewHistory![s.reviewHistory!.length - 1];
  const eyes = (["right", "left"] as Eye[]).filter((e) => s[e]);

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="My Report" subtitle={formatDateTime(s.createdAt)} action={<Button variant="ghost" onClick={() => window.print()}><Printer className="size-4" aria-hidden="true" /> Print / save as PDF</Button>} />
      </div>
      <Card className="print:shadow-none">
        <div className="border-b border-deep/10 pb-4">
          <div className="text-xs uppercase tracking-wide text-muted-strong">Eye screening report</div>
          <h2 className="font-display text-2xl font-semibold text-deep">{patient.name}</h2>
          <div className="text-sm text-muted-strong">Patient ID {patient.id} · reviewed by Dr.{last.by} on {formatDateTime(last.at)}</div>
        </div>

        <div className="mt-5 rounded-xl bg-gold-light/60 p-4 text-deep">
          <div className="text-xs uppercase tracking-wide">Doctor&apos;s advice</div>
          <div className="font-display text-xl font-semibold">{DECISION_LABEL[last.decision]}</div>
          <div className="text-sm">Next check: {last.followUp}</div>
        </div>

        <ul className="mt-5 grid gap-6 lg:grid-cols-2">
          {eyes.map((e) => {
            const img = s.images?.[e];
            return (
              <li key={e} className="rounded-xl bg-page p-4">
                <div className="text-xs uppercase tracking-wide text-muted-strong">{LABEL[e]}</div>
                <div className="mt-1 font-display text-lg font-semibold text-deep">{PLAIN_GRADE[last.finalGrades[e] ?? 0]}</div>
                {img && (
                  <div className="mt-4">
                    <GradcamViewer imageKey={img.processingKey} imageUrl={img.url} heatUrl={img.heatmapUrl} seed={`${img.checksum}${e}`} />
                    <p className="mt-3 text-xs text-muted-strong">
                      The coloured areas (red and yellow are strongest) show the parts of your retina the computer looked at most. They are a guide for your doctor, not a diagnosis.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {last.notes && <p className="mt-5 text-sm text-ink"><strong>Doctor&apos;s notes:</strong> {last.notes}</p>}
        <p className="mt-6 text-xs text-muted-strong">This report was written by your doctor. Computer analysis was used only as supporting information. If your vision changes suddenly, see a doctor straight away.</p>
      </Card>
    </>
  );
}