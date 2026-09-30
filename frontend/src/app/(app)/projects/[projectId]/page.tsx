import type { Metadata } from "next";
import { Hydrate } from "@/components/hydrate";
import { PageHeader } from "@/components/page-header";
import { NewExperimentDialog } from "@/components/projects/new-experiment-dialog";
import { ProjectExperiments } from "@/components/projects/project-experiments";
import { getServerApi, getServerQueryClient, handleServerApiError } from "@/lib/api/server";
import { queries } from "@/lib/queries";

async function loadProject(projectId: string) {
  const api = await getServerApi();
  return getServerQueryClient().fetchQuery(queries.project(api, projectId)).catch(handleServerApiError);
}

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const { projectId } = await params;
  return { title: (await loadProject(projectId)).name };
}

// Server Component: the project header is static. The experiments list is a client
// component (status filter, create dialog) hydrated from the server prefetch.
export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const project = await loadProject(projectId);
  await getServerQueryClient().prefetchQuery(queries.projectExperiments(await getServerApi(), projectId));

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Projects", href: "/projects" },
          { label: project.name },
        ]}
        actions={<NewExperimentDialog projectId={projectId} />}
      />
      <Hydrate>
        <ProjectExperiments projectId={projectId} />
      </Hydrate>
    </>
  );
}
