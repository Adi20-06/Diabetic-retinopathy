import { Card, PageHeader } from "@/components/ui";

const FAQ = [
  ["What is diabetic retinopathy?", "A condition where diabetes damages the small blood vessels at the back of the eye. Found early, it can be treated and sight can be saved."],
  ["How does the screening work?", "A health worker takes a photo of the back of each eye. A doctor reviews the photo. Computer analysis is only a helper for the doctor."],
  ["When will I get my result?", "After the doctor has reviewed your photos and released the report. You will see a notification, and the report appears under My Report."],
  ["Why was a new photo needed?", "If a photo is blurry, too dark or off-centre, it cannot be read reliably. Taking it again is the safe choice."],
  ["Who can see my information?", "Only your care team at the health centre. Your report is released to you only after a doctor has reviewed it."],
  ["What should I do if my vision suddenly worsens?", "See a doctor immediately. Do not wait for your next appointment."],
];

export default function Page() {
  return (
    <>
      <PageHeader title="Help" subtitle="Common questions." />
      <Card>
        {FAQ.map(([q, a]) => (
          <details key={q} className="group border-t border-deep/10 py-4 first:border-0">
            <summary className="cursor-pointer list-none font-medium text-deep marker:hidden">{q}</summary>
            <p className="mt-2 text-sm text-ink">{a}</p>
          </details>
        ))}
        <p className="mt-6 rounded-xl bg-gold-light/60 p-4 text-sm text-deep">Need more help? Ask the health worker at your health centre.</p>
      </Card>
    </>
  );
}