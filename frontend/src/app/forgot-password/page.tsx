import Link from "next/link";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout title="Forgot your password?" subtitle="A person at your health centre resets it for you.">
      <div className="space-y-3 text-sm leading-relaxed text-deep">
        <p><strong>Patients:</strong> ask the nurse at your health centre. They will give you a new temporary password, and you choose your own after signing in.</p>
        <p><strong>Nurses and doctors:</strong> ask your centre administrator to reset it.</p>
        <p>After 5 wrong attempts an account is locked for 10 minutes.</p>
      </div>
      <Link href="/login" className="mt-6 inline-block text-sm font-medium text-navy underline-offset-4 hover:underline">Back to sign in</Link>
    </AuthLayout>
  );
}