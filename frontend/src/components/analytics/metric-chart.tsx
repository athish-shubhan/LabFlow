"use client";

import { format } from "date-fns";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mergeSeriesRows, nearestPoint, timeTicks, type MetricPanel } from "@/lib/analytics";
import { formatCount, formatDateTime, formatNumber, humanize } from "@/lib/format";

const AXIS = "#6b6a66"; // secondary ink; axes and grid stay recessive
const GRID = "#e7e6e2";
const DAY = 86_400_000;

export function MetricChart({ panel }: { panel: MetricPanel }) {
  const rows = useMemo(() => mergeSeriesRows(panel), [panel]);
  const span = rows.length > 1 ? rows[rows.length - 1].t - rows[0].t : 0;
  const { ticks, stepHours } = useMemo(
    () => (rows.length ? timeTicks(rows[0].t, rows[rows.length - 1].t) : { ticks: [], stepHours: 1 }),
    [rows],
  );
  const tickLabel = (t: number) => format(t, stepHours >= 24 ? "d MMM" : span > DAY ? "d MMM HH:mm" : "HH:mm");
  const pointCount = panel.series.reduce((n, s) => n + s.points.length, 0);
  const title = humanize(panel.metric);
  const headingId = `panel-${panel.id.replace(/[^a-z0-9]/gi, "-")}`;

  return (
    <Card aria-labelledby={headingId}>
      <CardHeader>
        <CardTitle>
          <h2 id={headingId}>
            {title} <span className="font-normal text-muted-foreground">({panel.unit})</span>
          </h2>
        </CardTitle>
        <CardDescription>
          {panel.series.length} sample{panel.series.length === 1 ? "" : "s"} · {formatCount(pointCount)} readings
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <figure className="m-0">
          <div
            className="h-72 w-full"
            role="img"
            aria-label={`Line chart of ${title} in ${panel.unit} over time for ${panel.series
              .map((s) => s.sampleName)
              .join(", ")}. Exact values are in the table below.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  ticks={ticks}
                  tickFormatter={tickLabel}
                  stroke={AXIS}
                  tick={{ fontSize: 12, fill: AXIS }}
                  tickLine={false}
                  label={{ value: "Time (local)", position: "insideBottom", offset: -12, fill: AXIS, fontSize: 12 }}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => formatNumber(v)}
                  stroke={AXIS}
                  tick={{ fontSize: 12, fill: AXIS }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  label={{ value: panel.unit, angle: -90, position: "insideLeft", fill: AXIS, fontSize: 12, dx: 4 }}
                />
                <Tooltip
                  content={(props) => <PanelTooltip {...props} panel={panel} span={span} />}
                  cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
                  isAnimationActive={false}
                />
                {panel.series.map((s) => (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.sampleName}
                    type="linear"
                    stroke={s.color}
                    strokeWidth={2}
                    // A series with very few readings would be invisible as a line alone.
                    dot={s.points.length < 3 ? { r: 3, fill: s.color, strokeWidth: 0 } : false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="mt-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
              {panel.series.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.sampleName}
                </li>
              ))}
            </ul>
          </figcaption>
        </figure>

        <Table>
          <caption className="sr-only">
            Summary statistics for {title} ({panel.unit}) by sample
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Sample</TableHead>
              <TableHead className="text-right">Readings</TableHead>
              <TableHead className="text-right">
                Min ({panel.unit})
              </TableHead>
              <TableHead className="text-right">
                Mean ({panel.unit})
              </TableHead>
              <TableHead className="text-right">
                Max ({panel.unit})
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {panel.series.map((s) => (
              <TableRow key={s.key}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="inline-block size-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                    {s.sampleName}
                  </span>
                </TableCell>
                <TableCell className="tabular text-right">{formatCount(s.stats.count)}</TableCell>
                <TableCell className="tabular text-right">{formatNumber(s.stats.min)}</TableCell>
                <TableCell className="tabular text-right">{formatNumber(s.stats.mean)}</TableCell>
                <TableCell className="tabular text-right">{formatNumber(s.stats.max)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Samples are read at different instants, so instead of Recharts' default payload (only
 * series with a value at exactly this x) show each sample's nearest reading to the cursor.
 */
function PanelTooltip({ active, label, panel, span }: TooltipContentProps & { panel: MetricPanel; span: number }) {
  if (!active || typeof label !== "number") return null;
  const tolerance = Math.max(span * 0.02, 60_000);
  const readings = panel.series
    .map((s) => ({ s, p: nearestPoint(s.points, label) }))
    .filter(({ p }) => p && Math.abs(p.t - label) <= tolerance);
  if (readings.length === 0) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium">{formatDateTime(label)}</p>
      <ul className="grid gap-1">
        {readings.map(({ s, p }) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full" style={{ background: s.color }} aria-hidden />
            <span className="min-w-16">{s.sampleName}</span>
            <span className="tabular ml-auto font-medium">
              {formatNumber(p!.value)} {panel.unit}
            </span>
            {p!.t !== label && <span className="text-muted-foreground">at {format(p!.t, "HH:mm")}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
