"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { Button, Field } from "@/components/ui";
import { homeFor, login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(""); setBusy(true);
    try {
      const s = await login(String(f.get("username")), String(f.get("password")));
      if (!s) return setError("Incorrect ID or password.");
      router.push(s.mustChange ? "/change-password" : homeFor(s.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in with your ID. Patients, nurses and doctors all use this page.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field id="username" name="username" label="Patient ID or staff username" autoComplete="username" required />
        <Field id="password" name="password" type="password" label="Password" autoComplete="current-password" required />
        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="gold" className="mt-1 h-12" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</Button>
      </form>

      <div className="mt-5 text-sm">
        <Link href="/forgot-password" className="font-medium text-navy underline-offset-4 hover:underline">Forgot password?</Link>
      </div>

      <div className="mt-8 rounded-xl bg-gold-light/70 p-4 text-xs leading-relaxed text-deep">
        <strong>First time?</strong> Use the temporary password given to you by your nurse (patients) or centre administrator (staff).
        You will be asked to choose your own password right after signing in.
      </div>
    </AuthLayout>
  );
}