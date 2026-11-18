"use client";
import { useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";
import { Button, Field } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  return (
    <AuthLayout title="Reset your password" subtitle="Enter your patient ID or registered mobile number.">
      {sent ? (
        <div role="status" className="rounded-xl bg-ok-bg p-4 text-sm text-ok">
          If this account exists, a reset code has been sent. (Demo only: nothing is actually sent.)
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="flex flex-col gap-4">
          <Field id="who" name="who" label="Patient ID or mobile number" required />
          <Button type="submit" variant="gold" className="h-12">Send reset code</Button>
        </form>
      )}
      <p className="mt-5 text-sm">
        <Link href="/login" className="font-medium text-navy underline-offset-4 hover:underline">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}