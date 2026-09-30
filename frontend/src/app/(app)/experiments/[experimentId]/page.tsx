import type { Metadata } from "next";
import { ExperimentDetails } from "@/components/experiments/experiment-details";
import { SamplesPanel } from "@/components/experiments/samples-panel";
import { Hydrate } from "@/components/hydrate";
import { getServerApi, getServerQueryClient } from "@/lib/api/server";
import { queries } from "@/lib/queries";

export const metadata: Metadata = { title: "Experiment" };

export default async function ExperimentPage({ params }: PageProps<"/experiments/[experimentId]">) {
  const { experimentId } = await params;
  await getServerQueryClient().prefetchQuery(queries.samples(await getServerApi(), experimentId));

  return (
    <Hydrate>
      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <ExperimentDetails experimentId={experimentId} />
        <SamplesPanel experimentId={experimentId} />
      </div>
    </Hydrate>
  );
}
