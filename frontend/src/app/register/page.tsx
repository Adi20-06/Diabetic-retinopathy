"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { Button, Field, inputClass } from "@/components/ui";
import { homeFor, registerPatient } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");

 async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const mobile = String(f.get("mobile"));
    const pw = String(f.get("password"));
    if (!/^\d{10}$/.test(mobile)) return setError("Enter a 10-digit mobile number.");
    if (pw.length < 8) return setError("Password must be at least 8 characters.");
    if (pw !== String(f.get("confirm"))) return setError("Passwords do not match.");
    if (!consent) return setError("Privacy consent is required to register.");
    const r = await registerPatient({
      name: String(f.get("name")).trim(),
      dob: String(f.get("dob")),
      gender: String(f.get("gender")),
      mobile,
      password: pw,
    });
    if (r.error) return setError(r.error);
    router.push(homeFor("patient"));
  }

  return (
    <AuthLayout title="Create your account" subtitle="Register to view your screening results and appointments.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field id="name" name="name" label="Full name" autoComplete="name" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="dob" name="dob" type="date" label="Date of birth" required />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="gender" className="text-sm font-medium text-deep">Gender</label>
            <select id="gender" name="gender" className={inputClass} defaultValue="" required>
              <option value="" disabled>Select</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </div>
        </div>
        <Field id="mobile" name="mobile" type="tel" inputMode="numeric" label="Mobile number" placeholder="10-digit number" required />
        <Field id="password" name="password" type="password" label="Password" autoComplete="new-password" required />
        <Field id="confirm" name="confirm" type="password" label="Confirm password" autoComplete="new-password" required />

        <label className="flex items-start gap-3 rounded-xl bg-gold-light/60 p-4 text-sm leading-relaxed text-deep">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5 shrink-0 accent-navy" />
          <span>
            I consent to my retina images and screening data being processed for diabetic retinopathy screening and
            reviewed by authorised clinicians.
          </span>
        </label>

        {error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="gold" className="h-12">Create account</Button>
      </form>
      <p className="mt-5 text-sm text-muted-strong">
        Already registered? <Link href="/login" className="font-medium text-navy underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
}