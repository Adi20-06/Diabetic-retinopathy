"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { Button, Field } from "@/components/ui";
import { DEMO_OTP, demoFor, homeFor, login, loginWithOtp } from "@/lib/auth";
import type { Role } from "@/lib/nav";

const ROLES: { id: Role; label: string }[] = [
  { id: "patient", label: "Patient" },
  { id: "nurse", label: "Nurse" },
  { id: "doctor", label: "Doctor" },
];

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("patient");
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");

  const demo = demoFor(role);
  const usePassword = mode === "password" || role !== "patient";

  function pickRole(r: Role) {
    setRole(r); setMode("password"); setOtpSent(false); setError("");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  setError("");
  try {
      if (usePassword) {
        const s = await login(role, String(f.get("username")), String(f.get("password")));
        if (!s) return setError("Incorrect ID or password.");
        router.push(homeFor(s.role));
      } else if (!otpSent) {
        if (!/^\d{10}$/.test(String(f.get("mobile")))) return setError("Enter a 10-digit mobile number.");
        setOtpSent(true);
      } else {
        const s = await loginWithOtp(String(f.get("mobile")), String(f.get("otp")));
        if (!s) return setError("Invalid OTP, or this mobile number is not registered.");
        router.push(homeFor(s.role));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue to your portal.">
      <div role="group" aria-label="Sign in as" className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 ring-1 ring-deep/10">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={role === r.id}
            onClick={() => pickRole(r.id)}
            className={`h-10 rounded-lg text-sm font-medium transition ${role === r.id ? "bg-navy text-white" : "text-ink hover:bg-page"}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {role === "patient" && (
        <div className="mt-4 flex gap-6 border-b border-deep/10 text-sm">
          {(["password", "otp"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setOtpSent(false); setError(""); }}
              className={`-mb-px border-b-2 pb-2.5 font-medium transition ${mode === m ? "border-gold text-deep" : "border-transparent text-muted-strong hover:text-deep"}`}
            >
              {m === "password" ? "Password" : "Mobile OTP"}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {usePassword ? (
          <>
            <Field id="username" name="username" label={role === "patient" ? "Patient ID" : "User ID"} autoComplete="username" required />
            <Field id="password" name="password" type="password" label="Password" autoComplete="current-password" required />
          </>
        ) : (
          <>
            <Field id="mobile" name="mobile" type="tel" inputMode="numeric" label="Mobile number" placeholder="10-digit number" required />
            {otpSent && <Field id="otp" name="otp" inputMode="numeric" label="One-time code" placeholder="6-digit code" autoFocus required />}
          </>
        )}

        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <Button type="submit" variant="gold" className="mt-1 h-12">
          {usePassword ? "Sign in" : otpSent ? "Verify and sign in" : "Send code"}
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className="font-medium text-navy underline-offset-4 hover:underline">Forgot password?</Link>
        {role === "patient" && <Link href="/register" className="font-medium text-navy underline-offset-4 hover:underline">New patient? Register</Link>}
      </div>

      <div className="mt-8 rounded-xl bg-gold-light/70 p-4 text-xs leading-relaxed text-deep">
        <strong>Demo {role}:</strong> {demo.username} / {demo.password}
        {role === "patient" && <> &middot; OTP login: mobile {demo.mobile}, code {DEMO_OTP}</>}
      </div>
    </AuthLayout>
  );
}