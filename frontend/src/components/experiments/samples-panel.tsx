"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartLineIcon, TableIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { browserApi } from "@/lib/api/browser";
import { formatCount } from "@/lib/format";
import { queries } from "@/lib/queries";
import { AddMeasurementDialog } from "./add-measurement-dialog";
import { NewSampleDialog } from "./new-sample-dialog";

export function SamplesPanel({ experimentId }: { experimentId: string }) {
  const { data: samples, isPending, isError, error, refetch } = useQuery(queries.samples(browserApi, experimentId));
  const base = `/experiments/${experimentId}`;

  return (
    <section aria-labelledby="samples-heading" className="grid content-start gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="samples-heading" className="text-lg font-semibold">
          Samples
        </h2>
        <div className="flex flex-wrap gap-2">
          {samples && samples.length > 0 && (
            <>
              <Button asChild variant="outline">
                <Link href={`${base}/analytics`}>
                  <ChartLineIcon aria-hidden />
                  Analytics
                </Link>
              </Button>
              <AddMeasurementDialog experimentId={experimentId} samples={samples} />
            </>
          )}
          <NewSampleDialog experimentId={experimentId} />
        </div>
      </div>

      {isPending ? (
        <TableSkeleton rows={4} label="Loading samples" />
      ) : isError ? (
        <ErrorState title="Couldn't load samples" error={error} onRetry={() => refetch()} />
      ) : samples.length === 0 ? (
        <EmptyState
          title="No samples yet"
          description="Add a sample, then record measurements against it to see analytics."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <caption className="sr-only">Samples in this experiment</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Measurements</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {samples.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.type}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="tabular text-right">{formatCount(s.measurement_count)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`${base}/measurements?sample=${s.id}`} aria-label={`View measurements for ${s.name}`}>
                        <TableIcon aria-hidden />
                        Data
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
