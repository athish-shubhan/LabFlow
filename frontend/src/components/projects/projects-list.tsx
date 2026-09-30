"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { browserApi } from "@/lib/api/browser";
import { formatCount } from "@/lib/format";
import { queries } from "@/lib/queries";

export function ProjectsList({ orgId }: { orgId: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(queries.projects(browserApi, orgId));

  if (isPending) return <TableSkeleton rows={3} label="Loading projects" />;
  if (isError) return <ErrorState title="Couldn't load projects" error={error} onRetry={() => refetch()} />;
  if (data.length === 0) {
    return <EmptyState title="No projects yet" description="Create a project to start organising experiments." />;
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.map((p) => (
        <li key={p.id}>
          <Link
            href={`/projects/${p.id}`}
            className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 hover:bg-muted/40"
          >
            <h2 className="font-medium">{p.name}</h2>
            <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{p.description || "No description."}</p>
            <p className="flex justify-between text-xs text-muted-foreground">
              <span>
                {formatCount(p.experiment_count)} experiment{p.experiment_count === 1 ? "" : "s"}
              </span>
              <span>
                Created <LocalTime value={p.created_at} relative />
              </span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
