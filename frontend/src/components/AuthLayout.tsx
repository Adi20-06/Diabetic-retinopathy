import { Check, Eye } from "lucide-react";
import type { ReactNode } from "react";

const POINTS = [
  "Image quality is checked before the AI runs",
  "Explainable Grad-CAM++ evidence for every result",
  "Doctor-reviewed outcomes, with a full audit trail",
  "Keeps working offline in the field",
];

export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy p-12 text-white lg:flex">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(60%_50%_at_85%_8%,rgba(201,162,39,0.28),transparent)]" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gold/15 ring-1 ring-gold/40">
            <Eye className="size-5 text-gold" aria-hidden="true" />
          </div>
          <span className="font-display text-xl">DR Triage</span>
        </div>
        <div className="relative max-w-lg">
          <h2 className="font-display text-4xl font-semibold leading-tight">
            Retina screening that is quality-gated and clinician-reviewed.
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-white/80">
                <Check className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">Research prototype. AI supports the clinician and never replaces them.</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-xl bg-navy"><Eye className="size-5 text-gold" aria-hidden="true" /></div>
            <span className="font-display text-xl text-deep">DR Triage</span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-deep">{title}</h1>
          <p className="mt-2 text-sm text-muted-strong">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}