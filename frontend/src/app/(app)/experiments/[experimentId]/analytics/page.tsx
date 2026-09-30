import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { Hydrate } from "@/components/hydrate";
import { parseAnalyticsSearch, toAnalyticsFilters } from "@/lib/analytics";
import { getServerApi, getServerQueryClient } from "@/lib/api/server";
import { queries } from "@/lib/queries";

export const metadata: Metadata = { title: "Analytics" };

// Server Component shell: prefetches the samples and the charted data for the filters in
// the URL so the first paint has charts. The filter UI and charts are client components.
export default async function AnalyticsPage({ params, searchParams }: PageProps<"/experiments/[experimentId]/analytics">) {
  const { experimentId } = await params;
  const state = parseAnalyticsSearch(await searchParams);
  const api = await getServerApi();
  const qc = getServerQueryClient();

  const request = toAnalyticsFilters(state);
  await Promise.all([
    qc.prefetchQuery(queries.samples(api, experimentId)),
    // Date filters are converted using the browser's time zone, so only prefetch when
    // there are none (otherwise the server and browser keys would differ).
    request.ok && !state.from && !state.to ? qc.prefetchQuery(queries.analytics(api, experimentId, request.filters)) : null,
  ]);

  return (
    <Hydrate>
      <Suspense>
        <AnalyticsView experimentId={experimentId} />
      </Suspense>
    </Hydrate>
  );
}
