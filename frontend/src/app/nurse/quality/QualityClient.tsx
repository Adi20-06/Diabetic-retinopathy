"use client";
import { useEffect} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge, Button, Card, PageHeader, buttonStyles } from "@/components/ui";
import EyeThumb from "@/components/EyeThumb";
import { acceptImage, rejectImage, saveQuality, useDb, type Eye } from "@/lib/db";
import { assessBlob } from "@/lib/iqa";
import { getBlob } from "@/lib/images";

const LABEL: Record<Eye, string> = { right: "Right eye (OD)", left: "Left eye (OS)" };
const CHECK_LABEL = { blur: "Blur detection", illumination: "Illumination", glare: "Glare detection", centering: "Centering" , compression: "Image compression" } as const;

export default function QualityClient() {
  const db = useDb();
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const eyeParam = params.get("eye");
  

  const s = db?.screenings.find((x) => x.id === id);
  const eyes = (["right", "left"] as Eye[]).filter((e) => s?.[e]);
  const pick = eyes.find((e) => s?.[e] === "captured") ?? eyes.find((e) => s?.images?.[e]) ?? "right";
  const eye: Eye = eyeParam === "left" || eyeParam === "right" ? eyeParam : pick;
  const current = s?.images?.[eye];
  const stored = s?.quality?.[eye];

  useEffect(() => {
    if (!s || !current || stored?.checksum === current.checksum) return;
    let alive = true;
    Promise.all([getBlob(current.processingKey), getBlob(current.originalKey)]).then(async ([proc, orig]) => {
      if (!proc || !alive) return;
      const r = await assessBlob(proc, orig);
      if (alive) saveQuality(s.id, eye, { checksum: current.checksum, ...r, assessedAt: new Date().toISOString() });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id, eye, current?.checksum, stored?.checksum]);

  if (!db) return null;

  if (!s) {
    return (
      <>
        <PageHeader title="Image Quality Check" />
        <Card>
          <p className="text-sm text-muted-strong">Choose a screening first.</p>
          <Link href="/nurse/new-screening" className={`${buttonStyles("primary")} mt-4`}>Go to New Screening</Link>
        </Card>
      </>
    );
  }

  const other: Eye = eye === "right" ? "left" : "right";
  const otherState = s[other];
  const afterHref =
    otherState === "pending" ? `/nurse/capture?id=${s.id}&eye=${other}`
    : otherState === "captured" ? `/nurse/quality?id=${s.id}&eye=${other}`
    : otherState === "quality_failed" ? `/nurse/recapture?id=${s.id}&eye=${other}`
    : `/nurse/results?id=${s.id}`;
  const decided = s[eye] === "completed" || s[eye] === "quality_failed";

  return (
    <>
      <PageHeader title="Image Quality Check" subtitle={`${LABEL[eye]} · ${s.id}`} />

      {eyes.length > 1 && (
        <div className="mb-6 flex gap-2" role="tablist" aria-label="Eye">
          {eyes.map((e) => (
            <Link key={e} href={`/nurse/quality?id=${s.id}&eye=${e}`} role="tab" aria-selected={e === eye}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${e === eye ? "bg-navy text-white" : "bg-white text-ink ring-1 ring-deep/10 hover:bg-page"}`}>
              {LABEL[e]}
            </Link>
          ))}
        </div>
      )}

      {!current ? (
        <Card>
          <p className="text-sm text-muted-strong">No image has been captured for this eye yet.</p>
          <Link href={`/nurse/capture?id=${s.id}&eye=${eye}`} className={`${buttonStyles("gold")} mt-4`}>Capture image</Link>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Card>
            <EyeThumb imageKey={current.processingKey} className="w-full" />
            <div className="mt-5 flex items-center gap-5">
              <div
                role="img" aria-label={`Quality score ${stored?.score ?? 0} out of 100`}
                className="grid size-24 shrink-0 place-items-center rounded-full"
                style={{ background: `conic-gradient(var(--color-gold) ${(stored?.score ?? 0) * 3.6}deg, #E8EAF0 0)` }}
              >
                <div className="grid size-[76px] place-items-center rounded-full bg-white">
                  <span className="font-display text-2xl font-semibold text-deep">{stored ? stored.score : "…"}</span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-strong">Quality score</div>
                <div className="mt-1">
                  {!stored ? <Badge>Checking…</Badge> : stored.gradable ? <Badge tone="ok">Gradable</Badge> : <Badge tone="danger">Not gradable</Badge>}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-xl font-semibold text-deep">Quality checks</h2>
            {!stored ? (
              <p className="mt-4 text-sm text-muted-strong">Analysing the image…</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-4">
                {stored.checks.map((c) => (
                  <li key={c.id} className="rounded-xl bg-page p-4">
                    <div className="flex items-start gap-3">
                      {c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden="true" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />}
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-deep">{CHECK_LABEL[c.id]}</span>
                          <Badge tone={c.ok ? "ok" : "danger"}>{c.ok ? "Pass" : "Fail"}</Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-strong">Measured {c.value} · required {c.required}</div>
                        {!c.ok && <div className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{c.message}</div>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {stored && (
              <div className="mt-6 border-t border-deep/10 pt-5">
                {decided ? (
                  <div className="flex flex-wrap items-center gap-3">
                    {s[eye] === "completed" ? <Badge tone="ok">Image accepted</Badge> : <Badge tone="danger">Image rejected</Badge>}
                    <Link href={s[eye] === "completed" ? afterHref : `/nurse/recapture?id=${s.id}&eye=${eye}`} className={buttonStyles("primary")}>
                      {s[eye] === "completed" ? "Continue" : "Go to recapture"}
                    </Link>
                  </div>
                ) : stored.gradable ? (
                  <Button variant="gold" onClick={() => { acceptImage(s.id, eye); router.push(afterHref); }}>Accept gradable image</Button>
                ) : (
                  <div>
                    <p className="mb-3 text-sm text-danger">This image cannot be analysed. It must be recaptured.</p>
                    <Button variant="danger" onClick={() => { rejectImage(s.id, eye); router.push(`/nurse/recapture?id=${s.id}&eye=${eye}`); }}>
                      Reject image and recapture
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}