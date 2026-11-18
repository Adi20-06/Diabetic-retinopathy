"use client";
import type { IqaCheckResult } from "./db";
import { MIN_JPEG_QUALITY, estimateJpegQuality } from "./jpegq";

export const TH = { blurMin: 9, brightMin: 32, brightMax: 170, glareMax: 0.02, offsetMax: 0.06, areaMin: 0.6 };
const N = 512;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Same preprocessing as the backend: crop black borders, resize to 512 x 512. */
function toSquare(bmp: ImageBitmap): ImageData {
  const k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const o = document.createElement("canvas");
  o.width = N; o.height = N;
  const octx = o.getContext("2d", { willReadFrequently: true })!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, N, N);
  return octx.getImageData(0, 0, N, N);
}

/** Separable dilate (max) or erode (min) with a (2r+1) square window. */
function morph(src: Uint8Array, r: number, isMax: boolean): Uint8Array {
  const tmp = new Uint8Array(N * N), out = new Uint8Array(N * N);
  const pick = (a: number, b: number) => (isMax ? (b > a ? b : a) : b < a ? b : a);
  const neutral = isMax ? 0 : 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = neutral;
    for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < N) v = pick(v, src[y * N + xx]); }
    tmp[y * N + x] = v;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = neutral;
    for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < N) v = pick(v, tmp[yy * N + x]); }
    out[y * N + x] = v;
  }
  return out;
}

export type IqaOutcome = { score: number; gradable: boolean; checks: IqaCheckResult[] };

export function assessBitmap(bmp: ImageBitmap): IqaOutcome {
  const { data } = toSquare(bmp);
  const g = new Uint8Array(N * N);
  let mask = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
    g[i] = gg;
    mask[i] = 0.299 * r + 0.587 * gg + 0.114 * b > 15 ? 1 : 0;
  }
  mask = morph(morph(mask, 7, true), 7, false); // closing, like the Python gate

  let n = 0, sumG = 0, glareN = 0, sx = 0, sy = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (!mask[i]) continue;
    n++; sumG += g[i]; sx += x; sy += y;
    if (Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) > 240) glareN++;
  }

  let blur = 0, bright = 0, glare = 0, offset = 1, area = 0;
  if (n >= 100) {
    let m1 = 0, m2 = 0, cnt = 0;
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (!mask[i]) continue;
      const lap = g[i - 1] + g[i + 1] + g[i - N] + g[i + N] - 4 * g[i];
      m1 += lap; m2 += lap * lap; cnt++;
    }
    blur = cnt ? m2 / cnt - (m1 / cnt) ** 2 : 0;
    bright = sumG / n;
    glare = glareN / n;
    offset = Math.hypot((sx / n - N / 2) / N, (sy / n - N / 2) / N);
    area = n / (N * N);
  }

  const dark = bright < TH.brightMin;
  const illumOk = bright >= TH.brightMin && bright <= TH.brightMax;
  const centreOk = offset <= TH.offsetMax && area >= TH.areaMin;
  const checks: IqaCheckResult[] = [
    { id: "blur", ok: blur >= TH.blurMin, value: blur.toFixed(1), required: `at least ${TH.blurMin}`,
      message: "Image is blurry, hold the camera steady and refocus" },
    { id: "illumination", ok: illumOk, value: bright.toFixed(0), required: `${TH.brightMin} to ${TH.brightMax}`,
      message: dark ? "Image too dark, improve illumination" : "Image over-exposed, reduce light" },
    { id: "glare", ok: glare <= TH.glareMax, value: `${(glare * 100).toFixed(1)}%`, required: `at most ${TH.glareMax * 100}%`,
      message: "Glare detected, adjust camera angle" },
    { id: "centering", ok: centreOk, value: `offset ${offset.toFixed(2)}, area ${(area * 100).toFixed(0)}%`,
      required: `offset at most ${TH.offsetMax}, area at least ${TH.areaMin * 100}%`,
      message: "Eye not centred, realign the camera" },
  ];

  // Operator-facing score (0-100). Gradability itself is decided only by the four checks.
  const illumDist = bright < TH.brightMin ? TH.brightMin - bright : Math.max(0, bright - TH.brightMax);
  const sub = [
    clamp(blur / (TH.blurMin * 2)),
    illumOk ? 1 : clamp(1 - illumDist / 50),
    1 - clamp(glare / (TH.glareMax * 2)),
    Math.min(1 - clamp(offset / (TH.offsetMax * 2)), clamp(area / TH.areaMin)),
  ];
  const score = Math.round((sub.reduce((a, b) => a + b, 0) / sub.length) * 100);
  return { score, gradable: checks.every((c) => c.ok), checks };
}

export async function assessBlob(blob: Blob, original?: Blob): Promise<IqaOutcome> {
  const bmp = await createImageBitmap(blob);
  let r: IqaOutcome;
  try { r = assessBitmap(bmp); } finally { bmp.close(); }
  const q = original ? await estimateJpegQuality(original) : null;   // judged on the original file
  const ok = q === null || Math.round(q) >= MIN_JPEG_QUALITY;
  const checks: IqaCheckResult[] = [...r.checks, {
    id: "compression", ok, value: q === null ? "not applicable" : `about ${Math.round(q)}`,
    required: `at least ${MIN_JPEG_QUALITY}`, message: "Image is heavily compressed, capture or export at a higher JPEG quality",
  }];
  return { ...r, checks, gradable: r.gradable && ok };
}