"use client";
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useBlobUrl } from "@/lib/images";
import { seeded } from "@/lib/mockAi";

/** DEMO heatmap: a few smooth hot spots, coloured like Grad-CAM. Replaced by the real overlay in F9. */
function makeHeat(seed: string): string {
  const N = 256;
  const r = seeded(seed + "heat");
  const blobs = Array.from({ length: 3 }, () => ({
    x: 0.3 + r() * 0.4, y: 0.3 + r() * 0.4, s: 0.06 + r() * 0.08, w: 0.5 + r() * 0.5,
  }));
  const c = document.createElement("canvas");
  c.width = N; c.height = N;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const b of blobs) {
      const dx = x / N - b.x, dy = y / N - b.y;
      v += b.w * Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s));
    }
    v = clamp(v);
    const i = (y * N + x) * 4;
    img.data[i] = 255 * clamp(1.5 - Math.abs(4 * v - 3));
    img.data[i + 1] = 255 * clamp(1.5 - Math.abs(4 * v - 2));
    img.data[i + 2] = 255 * clamp(1.5 - Math.abs(4 * v - 1));
    img.data[i + 3] = v < 0.15 ? 0 : 255 * v;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

export default function GradcamViewer({ imageKey, imageUrl, heatUrl, seed }: { imageKey?: string; imageUrl?: string; heatUrl?: string | null; seed: string }) {
  const local = useBlobUrl(imageUrl ? undefined : imageKey);
  const url = imageUrl ?? local;
  const [demo, setDemo] = useState("");
  const [show, setShow] = useState(true);
  const [opacity, setOpacity] = useState(60);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { if (!heatUrl) setDemo(makeHeat(seed)); }, [seed, heatUrl]);
  const heat = heatUrl ?? demo;

  const zoom = (d: number) => setScale((s) => Math.max(1, Math.min(4, +(s + d).toFixed(2))));
  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  return (
    <div>
      <div
        className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-xl bg-deep"
        onPointerDown={(e) => { drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current && scale > 1) setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }); }}
        onPointerUp={() => { drag.current = null; }}
        style={{ cursor: scale > 1 ? "grab" : "default" }}
      >
        <div className="absolute inset-0" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}>
          {url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="Retinal fundus image" className="absolute inset-0 size-full object-contain" draggable={false} />}
          {show && heat && /* eslint-disable-next-line @next/next/no-img-element */ <img src={heat} alt="" aria-hidden="true" className="absolute inset-0 size-full object-contain" style={{ opacity: opacity / 100 }} draggable={false} />}
        </div>
        {!url && <div className="absolute inset-0 grid place-items-center text-sm text-white/70">Image not on this device</div>}
        {show && <span className="absolute left-3 top-3 rounded-md bg-deep/80 px-2 py-1 text-xs text-white">Grad-CAM++{heatUrl ? "" : " (demo)"}</span>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink print:hidden">
        <label className="flex items-center gap-2"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show heatmap</label>
        <label className="flex items-center gap-2">Opacity
          <input type="range" min={0} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} aria-label="Heatmap opacity" />
          <span className="w-9 text-muted-strong">{opacity}%</span>
        </label>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Zoom out" onClick={() => zoom(-0.5)} className="grid size-9 place-items-center rounded-lg bg-white ring-1 ring-deep/15 hover:bg-page"><Minus className="size-4" /></button>
          <span className="w-12 text-center text-muted-strong">{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoom(0.5)} className="grid size-9 place-items-center rounded-lg bg-white ring-1 ring-deep/15 hover:bg-page"><Plus className="size-4" /></button>
          <button type="button" aria-label="Reset view" onClick={reset} className="ml-1 grid size-9 place-items-center rounded-lg bg-white ring-1 ring-deep/15 hover:bg-page"><RotateCcw className="size-4" /></button>
        </div>
      </div>
    </div>
  );
}