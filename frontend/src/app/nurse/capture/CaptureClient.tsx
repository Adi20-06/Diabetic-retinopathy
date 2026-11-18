"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, UploadCloud, XCircle } from "lucide-react";
import { Button, Card, PageHeader, buttonStyles } from "@/components/ui";
import EyeThumb from "@/components/EyeThumb";
import { addEye, formatDateTime, resetEye, saveEyeImage, useDb, type Eye } from "@/lib/db";
import { processingCopy, putBlob, sha256, validateImage, type Check } from "@/lib/images";

type Stage = "idle" | "camera" | "review" | "saving";

export default function CaptureClient() {
  const db = useDb();
  const params = useSearchParams();
  const id = params.get("id");
  const eye: Eye = params.get("eye") === "left" ? "left" : "right";
  const eyeLabel = eye === "right" ? "Right eye (OD)" : "Left eye (OS)";

  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<"upload" | "camera">("upload");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<{ checks: Check[]; ok: boolean; width: number; height: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const s = db?.screenings.find((x) => x.id === id);
  const patient = db?.patients.find((p) => p.id === s?.patientId);
  const current = s?.images?.[eye];

  useEffect(() => {
    if (stage === "camera" && video.current && stream.current) video.current.srcObject = stream.current;
  }, [stage]);
  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function startCamera() {
    setError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setStage("camera");
    } catch {
      setError("Camera not available, or permission was denied.");
    }
  }

  function snap() {
    const v = video.current!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => {
      if (!b) return;
      stopCamera();
      load(new File([b], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }), "camera");
    }, "image/jpeg", 0.95);
  }

  async function load(f: File, src: "upload" | "camera") {
    setError(""); setSource(src); setResult(null);
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setStage("review");
    setResult(await validateImage(f));
  }

  function discard() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null); setFile(null); setResult(null); setStage("idle");
  }

  async function save() {
    if (!file || !result || !s) return;
    setStage("saving"); setProgress(5);
    const base = `${s.id}/${eye}/${Date.now()}`;
    setStep("Storing the original image");
    await putBlob(`${base}/original`, file);
    setProgress(40);
    setStep("Creating the processing copy");
    await putBlob(`${base}/processing`, await processingCopy(file));
    setProgress(70);
    setStep("Recording the image checksum");
    const checksum = await sha256(file);
    setProgress(95);
    saveEyeImage(s.id, eye, {
      name: file.name, format: file.type, width: result.width, height: result.height, size: file.size,
      checksum, capturedAt: new Date().toISOString(), source, originalKey: `${base}/original`, processingKey: `${base}/processing`,
    });
    setProgress(100);
    discard();
  }

  if (!db) return null;

  if (!s) {
    return (
      <>
        <PageHeader title="Fundus Image Capture" />
        <Card>
          <p className="text-sm text-muted-strong">Choose a screening first.</p>
          <Link href="/nurse/new-screening" className={`${buttonStyles("primary")} mt-4`}>Go to New Screening</Link>
        </Card>
      </>
    );
  }

  const other: Eye = eye === "right" ? "left" : "right";

  return (
    <>
      <PageHeader title="Fundus Image Capture" subtitle={`${eyeLabel} · ${s.id} · ${patient?.name}`} />

      {!patient?.verified ? (
        <Card><p className="text-sm text-danger">This patient is not verified. A screening needs a verified patient.</p></Card>
      ) : !s[eye] ? (
        <Card>
          <p className="text-sm text-muted-strong">{eyeLabel} is not part of this screening.</p>
          <Button className="mt-4" onClick={() => addEye(s.id, eye)}>Add this eye</Button>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <Card>
            {current && stage === "idle" ? (
              <div>
                <div className="flex items-center gap-2 text-ok"><CheckCircle2 className="size-5" aria-hidden="true" /><strong>Image saved</strong></div>
                <EyeThumb imageKey={current.processingKey} className="mx-auto mt-4 w-full max-w-md" />
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ["File", current.name],
                    ["Format", current.format.replace("image/", "").toUpperCase()],
                    ["Resolution", `${current.width} × ${current.height} px`],
                    ["Size", `${(current.size / 1024).toFixed(0)} KB`],
                    ["Source", current.source === "camera" ? "Camera" : "Upload"],
                    ["Captured", formatDateTime(current.capturedAt)],
                    ["SHA-256", `${current.checksum.slice(0, 16)}…`],
                  ].map(([k, v]) => (
                    <div key={k}><dt className="text-xs uppercase tracking-wide text-muted-strong">{k}</dt><dd className="mt-0.5 break-all font-medium text-deep">{v}</dd></div>
                  ))}
                </dl>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href={`/nurse/quality?id=${s.id}&eye=${eye}`} className={buttonStyles("gold")}>Next: image quality check</Link>
                  <Button variant="ghost" onClick={() => resetEye(s.id, eye)}>Retake image</Button>
                  {s[other] && !s.images?.[other] && (
                    <Link href={`/nurse/capture?id=${s.id}&eye=${other}`} className={buttonStyles("ghost")}>Capture {other} eye</Link>
                  )}
                </div>
              </div>
            ) : stage === "camera" ? (
              <div>
                <video ref={video} autoPlay playsInline muted className="aspect-video w-full rounded-xl bg-deep object-cover" />
                <div className="mt-4 flex gap-3">
                  <Button variant="gold" onClick={snap}><Camera className="size-4" aria-hidden="true" /> Capture photo</Button>
                  <Button variant="ghost" onClick={() => { stopCamera(); setStage("idle"); }}>Cancel</Button>
                </div>
              </div>
            ) : stage === "review" || stage === "saving" ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {preview && <img src={preview} alt="Selected fundus image" className="mx-auto max-h-[28rem] rounded-xl bg-deep object-contain" />}
                {stage === "saving" ? (
                  <div className="mt-5" role="status">
                    <div className="mb-2 flex justify-between text-sm"><span>{step}</span><span className="font-medium">{progress}%</span></div>
                    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2.5 overflow-hidden rounded-full bg-deep/10">
                      <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button variant="gold" disabled={!result?.ok} onClick={save}>Save image</Button>
                    <Button variant="ghost" onClick={discard}>Choose another</Button>
                  </div>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f, "upload"); }}
                className="grid place-items-center rounded-2xl border-2 border-dashed border-deep/20 bg-page px-6 py-16 text-center"
              >
                <UploadCloud className="size-10 text-gold" aria-hidden="true" />
                <p className="mt-4 font-display text-xl font-semibold text-deep">Drag and drop a fundus image</p>
                <p className="mt-1 text-sm text-muted-strong">JPEG or PNG, at least 512 × 512 px</p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button variant="gold" onClick={() => fileInput.current?.click()}>Upload fundus image</Button>
                  <Button variant="ghost" onClick={startCamera}><Camera className="size-4" aria-hidden="true" /> Use fundus camera</Button>
                </div>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/*" className="sr-only" aria-label="Choose fundus image"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f, "upload"); e.target.value = ""; }} />
              </div>
            )}
            {error && <p role="alert" className="mt-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
          </Card>

          <Card className="self-start">
            <h2 className="font-display text-xl font-semibold text-deep">Image validation</h2>
            {!result ? (
              <p className="mt-3 text-sm text-muted-strong">
                {stage === "review" ? "Checking the image…" : "Format, integrity, resolution and orientation are checked when you choose an image."}
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {result.checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 text-sm">
                    {c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden="true" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />}
                    <div>
                      <div className="font-medium text-deep">{c.label}: {c.ok ? "Passed" : "Failed"}</div>
                      <div className="text-muted-strong">{c.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 rounded-xl bg-gold-light/60 p-4 text-sm text-deep">
              The original image is stored untouched, and a separate processing copy is created for analysis.
            </div>
          </Card>
        </div>
      )}
    </>
  );
}