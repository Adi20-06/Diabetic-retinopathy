import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-deep">
      <h1 className="font-display text-3xl font-semibold">Privacy notice</h1>
      <p className="mt-2 rounded-lg bg-gold-light px-3 py-2">This is a research prototype. The text below is a template and must be reviewed by the health centre before real use.</p>
      <h2 className="mt-6 font-semibold">Who we are</h2>
      <p>[Health centre name and address] collects and uses your information for diabetic eye screening. Contact: [name, phone, email].</p>
      <h2 className="mt-6 font-semibold">What we collect and why</h2>
      <p>Your name, date of birth, gender, mobile number, medical history you tell us, and photographs of the back of your eye. We use them only to check your eyes for signs of diabetic eye disease and to arrange follow-up.</p>
      <h2 className="mt-6 font-semibold">How the AI is used</h2>
      <p>A computer program helps check the photographs. It does not make decisions. A doctor reviews every case and the doctor&apos;s decision is the one that counts.</p>
      <h2 className="mt-6 font-semibold">Who can see your information</h2>
      <p>Staff of this health centre who need it for your care. The doctor chosen for your case sees your photographs and the program&apos;s result. You see your own report after the doctor has reviewed it.</p>
      <h2 className="mt-6 font-semibold">How long we keep it</h2>
      <p>[Retention period set by the health centre]. After that your details are removed.</p>
      <h2 className="mt-6 font-semibold">Your rights</h2>
      <p>You can ask to see your information, correct it, or have it erased. Ask the nurse at your health centre. Erasure may be limited where the law requires records to be kept.</p>
      <h2 className="mt-6 font-semibold">If something goes wrong</h2>
      <p>If your information is exposed, we will tell you and the authorities as the law requires.</p>
      <p className="mt-8"><Link href="/login" className="font-medium text-navy underline underline-offset-4">Back to sign in</Link></p>
    </main>
  );
}