"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { DateFilterInput } from "@/components/date-filter-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toDateRangeParams } from "@/lib/analytics";
import { browserApi } from "@/lib/api/browser";
import { formatCount, formatDateTime, formatNumber } from "@/lib/format";
import { pageItems, pageRange, parsePage } from "@/lib/pagination";
import { queries } from "@/lib/queries";
import { METRIC_PATTERN } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100] as const;

interface UrlState {
  sample?: string;
  metric?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  order: "asc" | "desc";
}

function readUrl(params: URLSearchParams): UrlState {
  const size = Number(params.get("size"));
  return {
    sample: params.get("sample") ?? undefined,
    metric: params.get("metric") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    page: parsePage(params.get("page")),
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : 25,
    order: params.get("order") === "asc" ? "asc" : "desc",
  };
}

function writeUrl(state: UrlState, mode: "push" | "replace") {
  const p = new URLSearchParams();
  if (state.sample) p.set("sample", state.sample);
  if (state.metric) p.set("metric", state.metric);
  if (state.from) p.set("from", state.from);
  if (state.to) p.set("to", state.to);
  if (state.page > 1) p.set("page", String(state.page));
  if (state.pageSize !== 25) p.set("size", String(state.pageSize));
  if (state.order !== "desc") p.set("order", state.order);
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  // Next.js syncs native history updates into useSearchParams without a server round trip.
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export function MeasurementsView({ experimentId }: { experimentId: string }) {
  const searchParams = useSearchParams();
  const url = useMemo(() => readUrl(new URLSearchParams(searchParams.toString())), [searchParams]);
  const update = (patch: Partial<UrlState>, mode: "push" | "replace" = "replace") =>
    writeUrl({ ...url, page: 1, ...patch }, mode); // any filter change returns to page 1

  const samplesQuery = useQuery(queries.samples(browserApi, experimentId));
  const samples = samplesQuery.data;
  const sampleId = url.sample && samples?.some((s) => s.id === url.sample) ? url.sample : samples?.[0]?.id;
  const sample = samples?.find((s) => s.id === sampleId);

  // Metric text input: typed text is local UI state; the debounced value drives the URL/query.
  const [metricInput, setMetricInput] = useState(url.metric ?? "");
  const debouncedMetric = useDebouncedValue(metricInput.trim().toLowerCase(), 350);
  const metricInvalid = debouncedMetric !== "" && !METRIC_PATTERN.test(debouncedMetric);
  useEffect(() => {
    if (metricInvalid) return;
    if ((debouncedMetric || undefined) !== url.metric) update({ metric: debouncedMetric || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debouncedMetric]);

  const range = toDateRangeParams({ from: url.from, to: url.to });
  const filters = {
    metric: url.metric,
    from: range.ok ? range.from : undefined,
    to: range.ok ? range.to : undefined,
    page: url.page,
    pageSize: url.pageSize,
    order: url.order,
  };
  const measurements = useQuery({
    ...queries.measurements(browserApi, sampleId ?? "", filters),
    enabled: Boolean(sampleId) && range.ok,
  });
  const data = measurements.data;
  const { start, end } = pageRange(url.page, url.pageSize, data?.total ?? 0);
  const goTo = (page: number) => writeUrl({ ...url, page }, "push");
  const hasFilters = Boolean(url.metric || url.from || url.to || metricInput);

  if (samplesQuery.isPending) return <TableSkeleton rows={8} label="Loading samples" />;
  if (samplesQuery.isError) {
    return <ErrorState title="Couldn't load samples" error={samplesQuery.error} onRetry={() => samplesQuery.refetch()} />;
  }
  if (!samples || samples.length === 0) {
    return <EmptyState title="No samples yet" description="Add a sample on the Overview tab, then record measurements." />;
  }

  return (
    <div className="grid gap-4">
      <section aria-label="Filters" className="flex flex-wrap items-start gap-4 rounded-lg border bg-muted/30 p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="m-sample">Sample</Label>
          <NativeSelect id="m-sample" className="w-44" value={sampleId} onChange={(e) => update({ sample: e.target.value })}>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({formatCount(s.measurement_count)})
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="m-metric">Metric</Label>
          <Input
            id="m-metric"
            type="search"
            className="w-48"
            placeholder="e.g. temperature"
            autoCapitalize="none"
            spellCheck={false}
            value={metricInput}
            onChange={(e) => setMetricInput(e.target.value)}
            aria-invalid={metricInvalid}
            aria-describedby="m-metric-help"
          />
          <p id="m-metric-help" className={cn("text-xs", metricInvalid ? "font-medium text-destructive" : "text-muted-foreground")}>
            {metricInvalid ? "Metric names use lowercase letters, digits and _." : "Exact metric name."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="m-from">From</Label>
          <DateFilterInput
            id="m-from"
            className="w-40"
            value={url.from ?? ""}
            aria-invalid={!range.ok}
            aria-describedby={!range.ok ? "m-range-error" : undefined}
            onCommit={(v) => update({ from: v || undefined })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="m-to">To</Label>
          <DateFilterInput
            id="m-to"
            className="w-40"
            value={url.to ?? ""}
            aria-invalid={!range.ok}
            aria-describedby={!range.ok ? "m-range-error" : undefined}
            onCommit={(v) => update({ to: v || undefined })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="m-order">Order</Label>
          <NativeSelect
            id="m-order"
            className="w-36"
            value={url.order}
            onChange={(e) => update({ order: e.target.value === "asc" ? "asc" : "desc" })}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5 self-end">
          <Button
            variant="ghost"
            disabled={!hasFilters}
            onClick={() => {
              setMetricInput("");
              writeUrl({ sample: sampleId, page: 1, pageSize: url.pageSize, order: url.order }, "replace");
            }}
          >
            Clear filters
          </Button>
        </div>
        {!range.ok && (
          <p id="m-range-error" role="alert" className="basis-full text-xs font-medium text-destructive">
            {range.error}
          </p>
        )}
      </section>

      <div className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {measurements.isFetching && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
        {data && !measurements.isFetching
          ? data.total === 0
            ? "No readings"
            : `Showing ${formatCount(start)}–${formatCount(end)} of ${formatCount(data.total)} readings for ${sample?.name}`
          : measurements.isFetching
            ? "Loading readings…"
            : ""}
      </div>

      {!range.ok ? null : measurements.isPending ? (
        <TableSkeleton rows={10} label="Loading measurements" />
      ) : measurements.isError ? (
        <ErrorState title="Couldn't load measurements" error={measurements.error} onRetry={() => measurements.refetch()} />
      ) : data!.total === 0 ? (
        <EmptyState
          title={hasFilters ? "No readings match these filters" : "No readings for this sample yet"}
          description={hasFilters ? "Check the metric name or widen the date range." : "Use Add measurement on the Overview tab."}
        />
      ) : data!.items.length === 0 ? (
        <EmptyState
          title="This page is past the end of the results"
          action={
            <Button variant="outline" size="sm" onClick={() => goTo(1)}>
              Go to first page
            </Button>
          }
        />
      ) : (
        <>
          <div className={cn("rounded-lg border", measurements.isPlaceholderData && "opacity-60")} aria-busy={measurements.isPlaceholderData}>
            <Table>
              <caption className="sr-only">
                Measurements for {sample?.name}, page {url.page} of {data!.pages}
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="tabular">
                      <time dateTime={m.timestamp}>{formatDateTime(m.timestamp)}</time>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.metric}</TableCell>
                    <TableCell className="tabular text-right">{formatNumber(m.value)}</TableCell>
                    <TableCell>{m.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="m-size" className="font-normal text-muted-foreground">
                Rows per page
              </Label>
              <NativeSelect
                id="m-size"
                className="w-20"
                value={url.pageSize}
                onChange={(e) => update({ pageSize: Number(e.target.value) })}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <nav aria-label="Pagination">
              <ul className="flex items-center gap-1">
                <li>
                  <Button variant="outline" size="sm" disabled={url.page <= 1} onClick={() => goTo(url.page - 1)}>
                    <ChevronLeftIcon aria-hidden />
                    Previous
                  </Button>
                </li>
                {pageItems(url.page, data!.pages).map((item, i) =>
                  item === "gap" ? (
                    <li key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
                      …
                    </li>
                  ) : (
                    <li key={item}>
                      <Button
                        variant={item === url.page ? "secondary" : "ghost"}
                        size="sm"
                        className="tabular min-w-8"
                        aria-current={item === url.page ? "page" : undefined}
                        aria-label={`Page ${item}`}
                        onClick={() => goTo(item)}
                      >
                        {item}
                      </Button>
                    </li>
                  ),
                )}
                <li>
                  <Button variant="outline" size="sm" disabled={url.page >= data!.pages} onClick={() => goTo(url.page + 1)}>
                    Next
                    <ChevronRightIcon aria-hidden />
                  </Button>
                </li>
              </ul>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
