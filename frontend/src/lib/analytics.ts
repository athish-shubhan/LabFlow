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

/** Y domain with a little headroom so lines don't touch the plot edges. */
export function paddedDomain(panel: MetricPanel): [number, number] | undefined {
  let min = Infinity;
  let max = -Infinity;
  for (const s of panel.series) {
    min = Math.min(min, s.stats.min);
    max = Math.max(max, s.stats.max);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  const span = max - min || Math.abs(max) || 1;
  const pad = span * 0.08;
  return [niceFloor(min - pad), niceCeil(max + pad)];
}

function niceStep(v: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.abs(v) || 1));
  return mag / 10;
}
function niceFloor(v: number) {
  const step = niceStep(v);
  return Math.floor(v / step) * step;
}
function niceCeil(v: number) {
  const step = niceStep(v);
  return Math.ceil(v / step) * step;
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
