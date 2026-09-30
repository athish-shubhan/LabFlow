import { ExperimentHeader } from "@/components/experiments/experiment-header";
import { Hydrate } from "@/components/hydrate";
import { getServerApi, getServerQueryClient, handleServerApiError } from "@/lib/api/server";
import { queries } from "@/lib/queries";

// Loads the experiment (404s for unknown/other-tenant ids) and its project for the
// breadcrumbs, then hands the experiment to the client header so edits made on any tab
// (rename, status change, archive) show up in the header immediately.
export default async function ExperimentLayout({ params, children }: LayoutProps<"/experiments/[experimentId]">) {
  const { experimentId } = await params;
  const api = await getServerApi();
  const qc = getServerQueryClient();
  const experiment = await qc.fetchQuery(queries.experiment(api, experimentId)).catch(handleServerApiError);
  const project = await qc.fetchQuery(queries.project(api, experiment.project_id)).catch(handleServerApiError);

  return (
    <Hydrate>
      <ExperimentHeader experimentId={experimentId} project={{ id: project.id, name: project.name }} />
      {children}
    </Hydrate>
  );
}
