import type { AnalyticsSeries, SeriesStats } from "@/lib/api/types";

// Categorical palette (light surface). Validated for adjacent-pair colour-vision-deficiency
// separation in this order; colours are assigned by a sample's position in the experiment's
// full sample list, so filtering never repaints the samples that remain.
export const SERIES_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"] as const;
export const OVERFLOW_COLOR = "#8a8985";

export function sampleColorMap(sampleIds: readonly string[]): Map<string, string> {
  return new Map(sampleIds.map((id, i) => [id, SERIES_PALETTE[i] ?? OVERFLOW_COLOR]));
}

export interface ChartPoint {
  t: number; // epoch ms
  value: number;
}

export interface ChartSeries {
  key: string; // stable dataKey for Recharts
  sampleId: string;
  sampleName: string;
  color: string;
  stats: SeriesStats;
  points: ChartPoint[];
}

/** One chart panel: a single metric in a single unit (values in different units never share an axis). */
export interface MetricPanel {
  id: string;
  metric: string;
  unit: string;
  series: ChartSeries[];
}

export function seriesKey(sampleId: string) {
  return `s_${sampleId.replaceAll("-", "")}`;
}

export function buildMetricPanels(series: readonly AnalyticsSeries[], colors: ReadonlyMap<string, string>): MetricPanel[] {
  const panels = new Map<string, MetricPanel>();
  for (const s of series) {
    const id = `${s.metric}::${s.unit}`;
    let panel = panels.get(id);
    if (!panel) {
      panel = { id, metric: s.metric, unit: s.unit, series: [] };
      panels.set(id, panel);
    }
    panel.series.push({
      key: seriesKey(s.sample_id),
      sampleId: s.sample_id,
      sampleName: s.sample_name,
      color: colors.get(s.sample_id) ?? OVERFLOW_COLOR,
      stats: s.stats,
      points: s.points.map((p) => ({ t: Date.parse(p.timestamp), value: p.value })).sort((a, b) => a.t - b.t),
    });
  }
  const out = [...panels.values()];
  for (const p of out) p.series.sort((a, b) => a.sampleName.localeCompare(b.sampleName));
  return out.sort((a, b) => a.metric.localeCompare(b.metric) || a.unit.localeCompare(b.unit));
}

export type ChartRow = { t: number } & Record<string, number | undefined>;

/**
 * Merge a panel's series into Recharts rows keyed by timestamp. Samples are measured at
 * different instants, so most rows carry a value for only one series; lines use
 * connectNulls and the tooltip looks up each series' nearest reading instead.
 */
export function mergeSeriesRows(panel: MetricPanel): ChartRow[] {
  const rows = new Map<number, ChartRow>();
  for (const s of panel.series) {
    for (const p of s.points) {
      let row = rows.get(p.t);
      if (!row) {
        row = { t: p.t };
        rows.set(p.t, row);
      }
      row[s.key] = p.value;
    }
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

/** Point in a time-sorted list closest to t (binary search), or undefined when the list is empty. */
export function nearestPoint(points: readonly ChartPoint[], t: number): ChartPoint | undefined {
  if (points.length === 0) return undefined;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const after = points[lo];
  const before = points[lo - 1];
  if (before && Math.abs(before.t - t) <= Math.abs(after.t - t)) return before;
  return after;
}

const HOUR = 3_600_000;
const TICK_STEPS_HOURS = [1, 2, 3, 6, 12, 24, 48, 168];

/**
 * Time-axis ticks on round local boundaries (whole hours, or local midnights for day
 * steps), choosing the smallest step that yields at most `maxTicks` ticks. Recharts'
 * default numeric ticks fall at arbitrary instants, which repeats day labels.
 */
export function timeTicks(min: number, max: number, maxTicks = 8): { ticks: number[]; stepHours: number } {
  if (!(max > min)) return { ticks: Number.isFinite(min) ? [min] : [], stepHours: 1 };
  const span = max - min;
  const stepHours = TICK_STEPS_HOURS.find((h) => span / (h * HOUR) <= maxTicks) ?? TICK_STEPS_HOURS.at(-1)!;
  const d = new Date(min);
  if (stepHours >= 24) {
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < min) d.setDate(d.getDate() + 1);
  } else {
    d.setMinutes(0, 0, 0);
    if (d.getTime() < min) d.setHours(d.getHours() + 1);
    while (d.getHours() % stepHours !== 0) d.setHours(d.getHours() + 1);
  }
  const ticks: number[] = [];
  while (d.getTime() <= max) {
    ticks.push(d.getTime());
    if (stepHours >= 24) d.setDate(d.getDate() + stepHours / 24); // calendar days: DST-safe
    else d.setHours(d.getHours() + stepHours);
  }
  return { ticks, stepHours };
}

// ---- Date range filter ------------------------------------------------------------

export interface DateRangeInput {
  from?: string; // yyyy-mm-dd from <input type="date">
  to?: string;
}

export type DateRangeResult = { ok: true; from?: string; to?: string } | { ok: false; error: string };

/**
 * Convert inclusive calendar dates (in the user's time zone) into the timezone-aware
 * ISO instants the backend expects: `from` = start of that day, `to` = end of that day.
 */
export function toDateRangeParams({ from, to }: DateRangeInput): DateRangeResult {
  const start = from ? localDayBoundary(from, "start") : undefined;
  const end = to ? localDayBoundary(to, "end") : undefined;
  if (start === null || end === null) return { ok: false, error: "Enter valid dates" };
  if (start && end && start > end) return { ok: false, error: "The start date must be on or before the end date" };
  return { ok: true, from: start?.toISOString(), to: end?.toISOString() };
}

function localDayBoundary(value: string, edge: "start" | "end"): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = edge === "start" ? new Date(y, mo, d, 0, 0, 0, 0) : new Date(y, mo, d, 23, 59, 59, 999);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

// ---- URL <-> filter state ------------------------------------------------------------

type SearchParamsLike = URLSearchParams | Record<string, string | string[] | undefined>;

function getParam(params: SearchParamsLike, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Analytics filters as they live in the URL (shareable, survives reload). */
export interface AnalyticsUrlState {
  metric?: string;
  /** undefined = all samples; [] = none selected */
  samples?: string[];
  from?: string; // yyyy-mm-dd
  to?: string;
}

const METRIC_RE = /^[a-z][a-z0-9_]*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAnalyticsSearch(params: SearchParamsLike): AnalyticsUrlState {
  const metric = getParam(params, "metric");
  const samples = getParam(params, "samples");
  const from = getParam(params, "from");
  const to = getParam(params, "to");
  return {
    metric: metric && METRIC_RE.test(metric) ? metric : undefined,
    samples: samples === undefined ? undefined : samples.split(",").filter((id) => UUID_RE.test(id)),
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
  };
}

export function serializeAnalyticsSearch(state: AnalyticsUrlState): string {
  const p = new URLSearchParams();
  if (state.metric) p.set("metric", state.metric);
  if (state.samples !== undefined) p.set("samples", state.samples.join(","));
  if (state.from) p.set("from", state.from);
  if (state.to) p.set("to", state.to);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export type AnalyticsQueryResult =
  | { ok: true; filters: { metric?: string; sampleIds?: string[]; from?: string; to?: string } }
  | { ok: false; reason: "no-samples" | "invalid-range"; error: string };

/** URL state -> the filters sent to the backend (and used in the query key). */
export function toAnalyticsFilters(state: AnalyticsUrlState): AnalyticsQueryResult {
  if (state.samples !== undefined && state.samples.length === 0) {
    return { ok: false, reason: "no-samples", error: "Select at least one sample to plot." };
  }
  const range = toDateRangeParams({ from: state.from, to: state.to });
  if (!range.ok) return { ok: false, reason: "invalid-range", error: range.error };
  return {
    ok: true,
    filters: {
      metric: state.metric,
      sampleIds: state.samples ? [...state.samples].sort() : undefined,
      from: range.from,
      to: range.to,
    },
  };
}
