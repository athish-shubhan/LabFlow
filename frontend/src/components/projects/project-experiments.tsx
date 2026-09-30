"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { browserApi } from "@/lib/api/browser";
import { EXPERIMENT_STATUSES, type ExperimentStatus } from "@/lib/api/types";
import { formatCount, formatDate, humanize } from "@/lib/format";
import { queries } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function ProjectExperiments({ projectId }: { projectId: string }) {
  // The filter is UI state; the list itself is server state owned by TanStack Query,
  // filtered by the backend (?status=).
  const [status, setStatus] = useState<ExperimentStatus | undefined>();
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery(
    queries.projectExperiments(browserApi, projectId, status),
  );

  return (
    <section aria-labelledby="experiments-heading" className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="experiments-heading" className="text-lg font-semibold">
          Experiments
        </h2>
        <div className="grid gap-1.5">
          <Label htmlFor="experiment-status-filter">Status</Label>
          <NativeSelect
            id="experiment-status-filter"
            className="w-40"
            value={status ?? ""}
            onChange={(e) => setStatus((e.target.value || undefined) as ExperimentStatus | undefined)}
          >
            <option value="">All statuses</option>
            {EXPERIMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {isPending ? (
        <TableSkeleton rows={4} label="Loading experiments" />
      ) : isError ? (
        <ErrorState title="Couldn't load experiments" error={error} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title={status ? `No ${humanize(status).toLowerCase()} experiments` : "No experiments yet"}
          description={status ? "Try a different status filter." : "Create the first experiment in this project."}
        />
      ) : (
        <div className={cn("rounded-lg border", isPlaceholderData && "opacity-60")} aria-busy={isPlaceholderData}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead className="text-right">Samples</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-80">
                    <Link href={`/experiments/${e.id}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                    {e.description && <p className="truncate text-xs text-muted-foreground">{e.description}</p>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell>{e.owner?.name ?? "—"}</TableCell>
                  <TableCell className="tabular">{formatDate(e.start_date)}</TableCell>
                  <TableCell className="tabular">{formatDate(e.end_date)}</TableCell>
                  <TableCell className="tabular text-right">{formatCount(e.sample_count)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
