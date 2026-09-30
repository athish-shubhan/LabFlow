"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateFilterInput } from "@/components/date-filter-input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildMetricPanels,
  parseAnalyticsSearch,
  sampleColorMap,
  serializeAnalyticsSearch,
  toAnalyticsFilters,
  type AnalyticsUrlState,
} from "@/lib/analytics";
import { browserApi } from "@/lib/api/browser";
import { formatCount, humanize } from "@/lib/format";
import { queries } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { MetricChart } from "./metric-chart";

export function AnalyticsView({ experimentId }: { experimentId: string }) {
  const searchParams = useSearchParams();
  // Filters live in the URL: shareable, restored on reload, and not duplicated in state.
  const state = useMemo(() => parseAnalyticsSearch(new URLSearchParams(searchParams.toString())), [searchParams]);
  const setState = (next: AnalyticsUrlState) => {
    // Native history updates are synced into useSearchParams by Next.js without a server round trip.
    window.history.replaceState(null, "", `${window.location.pathname}${serializeAnalyticsSearch(next)}`);
  };

  const samplesQuery = useQuery(queries.samples(browserApi, experimentId));
  const samples = samplesQuery.data;
  const colors = useMemo(() => sampleColorMap((samples ?? []).map((s) => s.id)), [samples]);

  const request = toAnalyticsFilters(state);
  const analytics = useQuery({
    ...queries.analytics(browserApi, experimentId, request.ok ? request.filters : {}),
    enabled: request.ok,
  });
  const panels = useMemo(() => (analytics.data ? buildMetricPanels(analytics.data.series, colors) : []), [analytics.data, colors]);

  const selected = new Set(state.samples ?? samples?.map((s) => s.id) ?? []);
  const toggleSample = (id: string, checked: boolean) => {
    const all = samples?.map((s) => s.id) ?? [];
    const next = all.filter((sid) => (sid === id ? checked : selected.has(sid)));
    setState({ ...state, samples: next.length === all.length ? undefined : next });
  };
  const hasFilters = Boolean(state.metric || state.samples || state.from || state.to);
  const availableMetrics = analytics.data?.available_metrics ?? [];
  const totalPoints = panels.reduce((n, p) => n + p.series.reduce((m, s) => m + s.points.length, 0), 0);

  return (
    <div className="grid gap-6">
      <section aria-label="Filters" className="grid gap-4 rounded-lg border bg-muted/30 p-4 lg:grid-cols-[12rem_1fr_auto]">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="analytics-metric">Metric</Label>
          <NativeSelect
            id="analytics-metric"
            value={state.metric ?? ""}
            disabled={!analytics.data}
            onChange={(e) => setState({ ...state, metric: e.target.value || undefined })}
          >
            <option value="">All metrics</option>
            {availableMetrics.map((m) => (
              <option key={m} value={m}>
                {humanize(m)}
              </option>
            ))}
          </NativeSelect>
        </div>

        <fieldset className="grid content-start gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Samples</legend>
          {samplesQuery.isPending ? (
            <Skeleton className="h-6 w-64" />
          ) : samplesQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Couldn&apos;t load samples: {samplesQuery.error.message}
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {samples!.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`sample-${s.id}`}
                    checked={selected.has(s.id)}
                    onCheckedChange={(v) => toggleSample(s.id, v === true)}
                  />
                  <Label htmlFor={`sample-${s.id}`} className="font-normal">
                    <span className="inline-block size-2.5 rounded-full" style={{ background: colors.get(s.id) }} aria-hidden />
                    {s.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <div className="grid content-start gap-1.5">
          <span className="text-sm font-medium" id="range-label">
            Date range
          </span>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="range-label">
            <Label htmlFor="analytics-from" className="sr-only">
              From
            </Label>
            <DateFilterInput
              id="analytics-from"
              className="w-40"
              value={state.from ?? ""}
              max={state.to}
              aria-invalid={request.ok ? undefined : request.reason === "invalid-range"}
              aria-describedby={!request.ok && request.reason === "invalid-range" ? "range-error" : undefined}
              onCommit={(v) => setState({ ...state, from: v || undefined })}
            />
            <span className="text-sm text-muted-foreground" aria-hidden>
              to
            </span>
            <Label htmlFor="analytics-to" className="sr-only">
              To
            </Label>
            <DateFilterInput
              id="analytics-to"
              className="w-40"
              value={state.to ?? ""}
              min={state.from}
              aria-invalid={request.ok ? undefined : request.reason === "invalid-range"}
              aria-describedby={!request.ok && request.reason === "invalid-range" ? "range-error" : undefined}
              onCommit={(v) => setState({ ...state, to: v || undefined })}
            />
            <Button variant="ghost" size="sm" disabled={!hasFilters} onClick={() => setState({})}>
              <RotateCcwIcon aria-hidden />
              Reset
            </Button>
          </div>
          {!request.ok && request.reason === "invalid-range" && (
            <p id="range-error" role="alert" className="text-xs font-medium text-destructive">
              {request.error}
            </p>
          )}
        </div>
      </section>

      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {analytics.isFetching && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
        {analytics.isFetching
          ? "Updating charts…"
          : analytics.data && request.ok
            ? `${panels.length} metric${panels.length === 1 ? "" : "s"} · ${formatCount(totalPoints)} readings${
                state.from || state.to ? " in the selected range" : ""
              }`
            : ""}
      </p>

      {!request.ok ? (
        request.reason === "no-samples" ? (
          <EmptyState title="No samples selected" description={request.error} />
        ) : null
      ) : analytics.isPending ? (
        <div role="status" aria-label="Loading charts" className="grid gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      ) : analytics.isError ? (
        <ErrorState title="Couldn't load analytics" error={analytics.error} onRetry={() => analytics.refetch()} />
      ) : analytics.data.available_metrics.length === 0 ? (
        <EmptyState
          title="No measurements yet"
          description="Record measurements on this experiment's samples and they will be charted here."
        />
      ) : panels.length === 0 ? (
        <EmptyState
          title="No data matches these filters"
          description="Try a wider date range, another metric or more samples."
          action={
            <Button variant="outline" size="sm" onClick={() => setState({})}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className={cn("grid gap-6 2xl:grid-cols-2", analytics.isPlaceholderData && "opacity-60 transition-opacity")}>
          {panels.map((panel) => (
            <MetricChart key={panel.id} panel={panel} />
          ))}
        </div>
      )}
    </div>
  );
}
