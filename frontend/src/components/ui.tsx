import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-deep">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-strong">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(11,19,43,.05),0_0_0_1px_rgba(11,19,43,.06)] ${className}`}>
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, highlight = false }: { label: string; value: string | number; hint?: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "bg-gold-light/60" : ""}>
      <div className="text-sm text-muted-strong">{label}</div>
      <div className="mt-2 font-display text-4xl font-semibold text-deep">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-strong">{hint}</div>}
    </Card>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-deep/15 bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-gold focus:ring-2 focus:ring-gold/30";

export function Field({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-deep">{label}</label>
      <input id={id} {...props} className={inputClass} />
    </div>
  );
}

type Variant = "primary" | "gold" | "ghost" | "danger";

export function buttonStyles(variant: Variant = "primary") {
  const v = {
    primary: "bg-navy text-white hover:bg-deep",
    gold: "bg-gold text-deep hover:brightness-95",
    ghost: "bg-white text-ink ring-1 ring-deep/15 hover:bg-page",
    danger: "bg-danger text-white hover:brightness-95",
  }[variant];
  return `inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition disabled:opacity-50 ${v}`;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`${buttonStyles(variant)} ${className}`} />;
}

const TONES = {
  ok: "bg-ok-bg text-ok",
  danger: "bg-danger-bg text-danger",
  warn: "bg-gold-light text-warn",
  info: "bg-navy/10 text-navy",
  neutral: "bg-deep/5 text-ink",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}