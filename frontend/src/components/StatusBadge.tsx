import { Badge, type Tone } from "./ui";
import type { ScreeningStatus , EyeState } from "@/lib/db";

const MAP: Record<ScreeningStatus, { tone: Tone; label: string }> = {
  pending: { tone: "neutral", label: "Pending" },
  in_progress: { tone: "info", label: "In progress" },
  recapture_required: { tone: "danger", label: "Recapture required" },
  completed: { tone: "ok", label: "Completed" },
};

export default function StatusBadge({ status }: { status: ScreeningStatus }) {
  const m = MAP[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const EYE_MAP: Record<EyeState, { tone: Tone; label: string }> = {
  pending: { tone: "neutral", label: "Waiting for image" },
  captured: { tone: "info", label: "Image captured" },
  quality_failed: { tone: "danger", label: "Quality failed" },
  completed: { tone: "ok", label: "Completed" },
};
export function EyeBadge({ state }: { state: EyeState }) {
  const m = EYE_MAP[state];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}