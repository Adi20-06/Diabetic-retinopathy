"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { Button, Field } from "@/components/ui";
import { changePassword, getSession, homeFor, type Session } from "@/lib/auth";

const BAD = ["password", "welcome", "qwerty", "admin", "letmein", "nurse", "doctor", "patient", "india",
  "health", "diabetes", "retina", "hospital", "iloveyou", "abcdef", "changeme"];

function rules(pw: string, user: string) {
  const core = pw.toLowerCase().replace(/[^a-z]/g, "");
  return [
    { ok: pw.length >= 10, text: "At least 10 characters" },
    { ok: /[A-Za-z]/.test(pw) && /\d/.test(pw), text: "Letters and numbers" },
    { ok: !!pw && !pw.toLowerCase().includes(user.toLowerCase()), text: "Does not contain your ID or username" },
    { ok: !!pw && !BAD.some((w) => core.includes(w)) && new Set(pw).size > 3, text: "Not a common word or repeated characters" },
  ];
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [s, setS] = useState<Session | null>(null);
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const v = getSession();
    if (!v) router.replace("/login"); else setS(v);
  }, [router]);

  const list = rules(pw, s?.id ?? "");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const oldPw = String(f.get("old_password")), next = String(f.get("new_password"));
    setError("");
    if (next !== String(f.get("confirm"))) return setError("The two new passwords do not match.");
    if (list.some((r) => !r.ok)) return setError("Please meet every rule in the list.");
    setBusy(true);
    try {
      const ns = await changePassword(oldPw, next);
      router.push(homeFor(ns.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  if (!s) return null;
  return (
    <AuthLayout title="Change password" subtitle={s.mustChange ? "You are using a temporary password. Choose your own to continue." : "Choose a new password that is hard to guess."}>
      <form onSubmit={submit} onInput={(e) => { const t = e.target as HTMLInputElement; if (t.name === "new_password") setPw(t.value); }}
            className="flex flex-col gap-4">
        <Field id="old_password" name="old_password" type="password" label={s.mustChange ? "Temporary password" : "Current password"} autoComplete="current-password" required />
        <Field id="new_password" name="new_password" type="password" label="New password" autoComplete="new-password" required />
        <ul className="-mt-1 space-y-1 text-xs">
          {list.map((r) => (
            <li key={r.text} className={r.ok ? "text-emerald-700" : "text-muted-strong"}>{r.ok ? "✓" : "○"} {r.text}</li>
          ))}
        </ul>
        <Field id="confirm" name="confirm" type="password" label="Repeat new password" autoComplete="new-password" required />
        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="gold" className="mt-1 h-12" disabled={busy}>{busy ? "Saving..." : "Save new password"}</Button>
      </form>
      {!s.mustChange && (
        <p className="mt-5 text-sm"><Link href={homeFor(s.role)} className="font-medium text-navy underline-offset-4 hover:underline">Back to my portal</Link></p>
      )}
    </AuthLayout>
  );
}