"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button, Card, PageHeader, buttonStyles } from "@/components/ui";
import StatusBadge from "@/components/StatusBadge";
import { formatDateTime, resetEye, useDb, type Eye } from "@/lib/db";

const LABEL: Record<Eye, string> = { right: "Right eye (OD)", left: "Left eye (OS)" };

const FIX: Record<string, { title: string; tips: string[] }> = {
  blur: { title: "Blur correction", tips: ["Hold the camera steady and rest your elbows.", "Wait for the autofocus to settle before capturing.", "Clean the lens."] },
  dark: { title: "Lighting correction", tips: ["Increase the camera illumination.", "Dim the room so the retina is evenly lit."] },
  bright: { title: "Lighting correction", tips: ["Reduce the camera illumination.", "Avoid bright room light shining into the eye."] },
  glare: { title: "Glare correction", tips: ["Tilt the camera slightly to remove the reflection.", "Clean the lens and ask the patient to look straight ahead."] },
  centering: { title: "Centering correction", tips: ["Align the camera so the optic disc and macula are near the centre.", "Fill the frame with the retina."] },
  compression: { title: "Compression correction", tips: ["Use the camera's highest JPEG quality setting.", "Do not send the image through a chat app first, because those compress it.", "Capture again, or export the original file from the camera."] },
};

export default function RecaptureClient() {
  const db = useDb();
  const router = useRouter();
  const id = useSearchParams().get("id");
  if (!db) return null;

  const s = db.screenings.find((x) => x.id === id);

  if (!s) {
    const list = db.screenings.filter((x) => x.status === "recapture_required");
    return (
      <>
        <PageHeader title="Image Recapture" subtitle="Screenings that need a new image." />
        <Card>
          {list.length === 0 && <p className="text-sm text-muted-strong">No recapture is needed right now.</p>}
          <ul>
            {list.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-deep/10 py-3 text-sm first:border-0">
                <span><strong className="text-deep">{x.id}</strong> <span className="text-muted-strong">· {db.patients.find((p) => p.id === x.patientId)?.name} · {formatDateTime(x.createdAt)}</span></span>
                <span className="flex items-center gap-3"><StatusBadge status={x.status} /><Link href={`/nurse/recapture?id=${x.id}`} className="font-semibold text-navy underline underline-offset-4">Open</Link></span>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const failedEyes = (["right", "left"] as Eye[]).filter((e) => s[e] === "quality_failed");
  const attempts = (e: Eye) => (s.captures ?? []).filter((c) => c.eye === e).length;

  return (
    <>
      <PageHeader title="Image Recapture" subtitle={`${s.id} · ${db.patients.find((p) => p.id === s.patientId)?.name}`} />
      {failedEyes.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-strong">No eye needs recapture in this screening.</p>
          <Link href={`/nurse/new-screening?id=${s.id}`} className={`${buttonStyles("primary")} mt-4`}>Back to screening</Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {failedEyes.map((e) => {
            const failed = s.quality?.[e]?.checks.filter((c) => !c.ok) ?? [];
            const keys = failed.map((c) => (c.id === "illumination" ? (c.message.includes("dark") ? "dark" : "bright") : c.id));
            return (
              <Card key={e}>
                <div role="alert" className="flex items-start gap-3 rounded-xl bg-gold-light p-4 text-deep">
                  <AlertTriangle className="size-6 shrink-0 text-warn" aria-hidden="true" />
                  <div>
                    <div className="font-display text-lg font-semibold">Recapture required: {LABEL[e]}</div>
                    <div className="text-sm">The image was not suitable for analysis. Attempt {attempts(e)} so far.</div>
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {keys.map((k, i) => (
                    <div key={k} className="rounded-xl bg-page p-4">
                      <div className="text-sm font-semibold text-danger">{failed[i].message}</div>
                      <div className="mt-2 text-xs uppercase tracking-wide text-muted-strong">{FIX[k].title}</div>
                      <ul className="mt-1 list-disc pl-5 text-sm text-deep">{FIX[k].tips.map((t) => <li key={t}>{t}</li>)}</ul>
                    </div>
                  ))}
                </div>
                <Button variant="gold" className="mt-6" onClick={() => { resetEye(s.id, e); router.push(`/nurse/capture?id=${s.id}&eye=${e}`); }}>
                  Retake image
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}