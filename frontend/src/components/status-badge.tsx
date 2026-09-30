import { Badge } from "@/components/ui/badge";
import type { ExperimentStatus, SampleStatus } from "@/lib/api/types";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

// Status is always shown as text; colour is only a secondary cue.
const STYLES: Record<ExperimentStatus | SampleStatus, string> = {
  planned: "border-slate-300 bg-slate-50 text-slate-700",
  running: "border-blue-300 bg-blue-50 text-blue-800",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-800",
  archived: "border-zinc-300 bg-zinc-100 text-zinc-600",
  pending: "border-slate-300 bg-slate-50 text-slate-700",
  in_progress: "border-blue-300 bg-blue-50 text-blue-800",
  complete: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export function StatusBadge({ status, className }: { status: ExperimentStatus | SampleStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STYLES[status], className)}>
      {humanize(status)}
    </Badge>
  );
}
