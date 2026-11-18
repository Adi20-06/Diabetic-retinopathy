import { Badge } from "@/components/ui";
import type { Priority } from "@/lib/mockAi";

export default function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "referable") return <Badge tone="danger">Referable</Badge>;
  if (priority === "uncertain") return <Badge>Uncertain</Badge>;
  if (priority === "non-referable") return <Badge tone="ok">Non-referable</Badge>;
  return <Badge>Awaiting AI</Badge>;
}