import type { Metadata } from "next";
import { Suspense } from "react";
import { Hydrate } from "@/components/hydrate";
import { MeasurementsView } from "@/components/measurements/measurements-view";
import { TableSkeleton } from "@/components/states";
import { getServerApi, getServerQueryClient } from "@/lib/api/server";
import { queries } from "@/lib/queries";

export const metadata: Metadata = { title: "Measurements" };

// Only the sample list is prefetched; the table itself is driven by client-side filters
// and pagination (all served by the backend's paginated endpoint).
export default async function MeasurementsPage({ params }: PageProps<"/experiments/[experimentId]/measurements">) {
  const { experimentId } = await params;
  await getServerQueryClient().prefetchQuery(queries.samples(await getServerApi(), experimentId));

  return (
    <Hydrate>
      <Suspense fallback={<TableSkeleton rows={8} label="Loading measurements" />}>
        <MeasurementsView experimentId={experimentId} />
      </Suspense>
    </Hydrate>
  );
}
