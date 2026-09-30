import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { unwrap } from "@/lib/api/client";
import { getServerApi, handleServerApiError, requireSession } from "@/lib/api/server";
import { EXPERIMENT_STATUSES, SAMPLE_STATUSES, type Dashboard } from "@/lib/api/types";
import { formatCount, formatValue, humanize } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

// Server Component: read-only summary, rendered once per request from the backend's
// dashboard endpoint. Nothing on this page needs client-side state.
export default async function DashboardPage() {
  const { orgId } = await requireSession();
  const api = await getServerApi();
  const data = await unwrap(
    api.GET("/api/organizations/{org_id}/dashboard", { params: { path: { org_id: orgId } } }),
  ).catch(handleServerApiError);

  return (
    <>
      <PageHeader title="Dashboard" description={`Activity across all projects in ${data.organization.name}.`} />

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Projects" value={data.project_count} href="/projects" />
        <StatTile
          label="Experiments"
          value={data.experiment_count}
          detail={`${formatCount(data.active_experiment_count)} running`}
        />
        <StatTile label="Samples" value={data.sample_count} detail={`${formatCount(data.samples_by_status.in_progress ?? 0)} in progress`} />
        <StatTile
          label="Measurements"
          value={data.measurement_count}
          detail={`${formatCount(data.measurements_last_7_days)} in the last 7 days`}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <StatusBreakdown
          title="Experiments by status"
          counts={data.experiments_by_status}
          order={EXPERIMENT_STATUSES}
          total={data.experiment_count}
        />
        <StatusBreakdown title="Samples by status" counts={data.samples_by_status} order={SAMPLE_STATUSES} total={data.sample_count} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <RecentExperiments items={data.recent_experiments} />
        <RecentMeasurements items={data.recent_measurements} />
      </div>
    </>
  );
}

function StatTile({ label, value, detail, href }: { label: string; value: number; detail?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{formatCount(value)}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </>
  );
  return (
    <Card className="px-4 py-4">
      {href ? (
        <Link href={href} className="block rounded-sm">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

function StatusBreakdown({
  title,
  counts,
  order,
  total,
}: {
  title: string;
  counts: Record<string, number>;
  order: readonly string[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{formatCount(total)} total</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3">
          {order.map((status) => {
            const n = counts[status] ?? 0;
            const pct = total ? (n / total) * 100 : 0;
            return (
              <div key={status} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                <dt>{humanize(status)}</dt>
                <dd className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                </dd>
                <dd className="tabular text-right font-medium">{formatCount(n)}</dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

function RecentExperiments({ items }: { items: Dashboard["recent_experiments"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Recently updated experiments</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title="No experiments yet" description="Create a project and add experiments to see them here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Experiment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-64">
                    <Link href={`/experiments/${e.id}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{e.project_name}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <LocalTime value={e.updated_at} relative />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RecentMeasurements({ items }: { items: Dashboard["recent_measurements"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Latest measurements</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title="No measurements recorded" description="Measurements added to samples will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sample</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <span className="font-medium">{m.sample_name}</span>
                    <p className="max-w-48 truncate text-xs text-muted-foreground">
                      <Link href={`/experiments/${m.experiment_id}`} className="hover:underline">
                        {m.experiment_name}
                      </Link>
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.metric}</TableCell>
                  <TableCell className="tabular text-right">{formatValue(m.value, m.unit)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <LocalTime value={m.timestamp} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
