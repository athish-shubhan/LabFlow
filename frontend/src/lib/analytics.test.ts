import { describe, expect, it } from "vitest";
import type { AnalyticsSeries } from "@/lib/api/types";
import {
  buildMetricPanels,
  mergeSeriesRows,
  nearestPoint,
  OVERFLOW_COLOR,
  parseAnalyticsSearch,
  sampleColorMap,
  SERIES_PALETTE,
  serializeAnalyticsSearch,
  timeTicks,
  toAnalyticsFilters,
  toDateRangeParams,
} from "./analytics";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function series(sampleId: string, sampleName: string, metric: string, unit: string, points: [string, number][]): AnalyticsSeries {
  const values = points.map(([, v]) => v);
  return {
    sample_id: sampleId,
    sample_name: sampleName,
    metric,
    unit,
    stats: { count: values.length, min: Math.min(...values), max: Math.max(...values), mean: 0 },
    points: points.map(([timestamp, value]) => ({ timestamp, value })),
  };
}

describe("buildMetricPanels", () => {
  const colors = sampleColorMap([A, B, C]);
  const apiSeries = [
    series(B, "S-02", "temperature", "°C", [["2026-09-21T09:00:00Z", 71], ["2026-09-21T08:00:00Z", 70]]),
    series(A, "S-01", "temperature", "°C", [["2026-09-21T08:30:00Z", 72]]),
    series(A, "S-01", "pressure", "kPa", [["2026-09-21T08:00:00Z", 101]]),
    series(C, "S-03", "temperature", "K", [["2026-09-21T08:00:00Z", 344]]),
  ];

  it("groups series into one panel per metric and unit, never mixing units on an axis", () => {
    const panels = buildMetricPanels(apiSeries, colors);
    expect(panels.map((p) => `${p.metric} (${p.unit})`)).toEqual(["pressure (kPa)", "temperature (°C)", "temperature (K)"]);
  });

  it("sorts samples by name inside a panel and points by time", () => {
    const temp = buildMetricPanels(apiSeries, colors).find((p) => p.unit === "°C")!;
    expect(temp.series.map((s) => s.sampleName)).toEqual(["S-01", "S-02"]);
    const s02 = temp.series[1];
    expect(s02.points.map((p) => p.value)).toEqual([70, 71]);
    expect(s02.points[0].t).toBe(Date.parse("2026-09-21T08:00:00Z"));
  });

  it("keeps each sample's colour when other samples are filtered out", () => {
    const all = buildMetricPanels(apiSeries, colors);
    const onlyB = buildMetricPanels([apiSeries[0]], colors);
    const colorOfB = (panels: typeof all) => panels.flatMap((p) => p.series).find((s) => s.sampleId === B)!.color;
    expect(colorOfB(onlyB)).toBe(colorOfB(all));
    expect(colorOfB(all)).toBe(SERIES_PALETTE[1]);
  });

  it("uses a neutral colour instead of cycling hues past the palette", () => {
    const ids = Array.from({ length: SERIES_PALETTE.length + 1 }, (_, i) => `id-${i}`);
    const map = sampleColorMap(ids);
    expect(new Set(ids.slice(0, SERIES_PALETTE.length).map((id) => map.get(id))).size).toBe(SERIES_PALETTE.length);
    expect(map.get(ids.at(-1)!)).toBe(OVERFLOW_COLOR);
  });
});

describe("mergeSeriesRows", () => {
  it("builds one Recharts row per distinct timestamp with a column per sample", () => {
    const [panel] = buildMetricPanels(
      [
        series(A, "S-01", "ph", "pH", [["2026-09-21T08:00:00Z", 7.0], ["2026-09-21T09:00:00Z", 6.8]]),
        series(B, "S-02", "ph", "pH", [["2026-09-21T08:00:00Z", 7.1], ["2026-09-21T08:30:00Z", 7.0]]),
      ],
      sampleColorMap([A, B]),
    );
    const rows = mergeSeriesRows(panel);
    const [kA, kB] = panel.series.map((s) => s.key);
    expect(rows).toEqual([
      { t: Date.parse("2026-09-21T08:00:00Z"), [kA]: 7.0, [kB]: 7.1 },
      { t: Date.parse("2026-09-21T08:30:00Z"), [kB]: 7.0 },
      { t: Date.parse("2026-09-21T09:00:00Z"), [kA]: 6.8 },
    ]);
  });
});

describe("nearestPoint", () => {
  const points = [10, 20, 40, 80].map((t) => ({ t, value: t / 10 }));
  it.each([
    [0, 10],
    [14, 10],
    [16, 20],
    [30, 20], // tie resolves to the earlier reading
    [61, 80],
    [500, 80],
  ])("t=%i -> reading at %i", (t, expected) => {
    expect(nearestPoint(points, t)?.t).toBe(expected);
  });
  it("returns undefined for an empty series", () => {
    expect(nearestPoint([], 5)).toBeUndefined();
  });
});

describe("toDateRangeParams (test TZ = Asia/Kolkata, UTC+05:30)", () => {
  it("runs in the configured zone", () => {
    expect(new Date("2026-09-25T00:00:00").getTimezoneOffset()).toBe(-330);
  });

  it("expands inclusive local days to aware instants", () => {
    expect(toDateRangeParams({ from: "2026-09-25", to: "2026-09-26" })).toEqual({
      ok: true,
      from: "2026-09-24T18:30:00.000Z",
      to: "2026-09-26T18:29:59.999Z",
    });
  });

  it("accepts a single-day range and open ends", () => {
    expect(toDateRangeParams({ from: "2026-09-25", to: "2026-09-25" }).ok).toBe(true);
    expect(toDateRangeParams({ to: "2026-09-25" })).toEqual({ ok: true, from: undefined, to: "2026-09-25T18:29:59.999Z" });
    expect(toDateRangeParams({})).toEqual({ ok: true, from: undefined, to: undefined });
  });

  it("rejects a start after the end and impossible dates", () => {
    expect(toDateRangeParams({ from: "2026-09-26", to: "2026-09-25" })).toMatchObject({ ok: false });
    expect(toDateRangeParams({ from: "2026-02-30" })).toMatchObject({ ok: false, error: "Enter valid dates" });
  });
});

describe("analytics URL state", () => {
  it("round-trips through the query string", () => {
    const state = { metric: "yield", samples: [B, A], from: "2026-09-21", to: "2026-09-29" };
    const qs = serializeAnalyticsSearch(state);
    expect(parseAnalyticsSearch(new URLSearchParams(qs.slice(1)))).toEqual(state);
  });

  it("drops invalid values instead of sending them to the API", () => {
    expect(parseAnalyticsSearch({ metric: "Bad Metric", samples: `${A},not-a-uuid`, from: "yesterday" })).toEqual({
      metric: undefined,
      samples: [A],
      from: undefined,
      to: undefined,
    });
  });

  it("distinguishes 'all samples' (param absent) from 'none selected' (empty)", () => {
    expect(parseAnalyticsSearch({}).samples).toBeUndefined();
    expect(parseAnalyticsSearch({ samples: "" }).samples).toEqual([]);
    expect(toAnalyticsFilters({ samples: [] })).toMatchObject({ ok: false, reason: "no-samples" });
  });

  it("sorts sample ids so equal selections share a cache key", () => {
    const a = toAnalyticsFilters({ samples: [B, A] });
    const b = toAnalyticsFilters({ samples: [A, B] });
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: true, filters: { sampleIds: [A, B] } });
  });

  it("reports an inverted date range", () => {
    expect(toAnalyticsFilters({ from: "2026-09-29", to: "2026-09-21" })).toMatchObject({ ok: false, reason: "invalid-range" });
  });
});

describe("timeTicks", () => {
  it("places multi-day ticks on local midnights", () => {
    const min = new Date(2026, 8, 21, 8, 19).getTime();
    const max = new Date(2026, 8, 29, 22, 52).getTime();
    const { ticks, stepHours } = timeTicks(min, max);
    expect(stepHours).toBe(48);
    expect(ticks.every((t) => new Date(t).getHours() === 0 && new Date(t).getMinutes() === 0)).toBe(true);
    expect(ticks[0]).toBe(new Date(2026, 8, 22).getTime());
    expect(ticks.every((t) => t >= min && t <= max)).toBe(true);
  });

  it("uses whole-hour ticks for short spans", () => {
    const min = new Date(2026, 8, 21, 8, 10).getTime();
    const { ticks, stepHours } = timeTicks(min, min + 5 * 3_600_000);
    expect(stepHours).toBe(1);
    expect(ticks.map((t) => new Date(t).getHours())).toEqual([9, 10, 11, 12, 13]);
  });
});
