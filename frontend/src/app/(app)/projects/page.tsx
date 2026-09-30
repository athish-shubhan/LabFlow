import type { Metadata } from "next";
import { Hydrate } from "@/components/hydrate";
import { PageHeader } from "@/components/page-header";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectsList } from "@/components/projects/projects-list";
import { getServerApi, getServerQueryClient, requireSession } from "@/lib/api/server";
import { queries } from "@/lib/queries";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { orgId } = await requireSession();
  // Prefetch on the server; errors are left for the client list to show with a retry.
  await getServerQueryClient().prefetchQuery(queries.projects(await getServerApi(), orgId));

  return (
    <>
      <PageHeader
        title="Projects"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Projects" }]}
        description="Each project groups the experiments for one line of research."
        actions={<NewProjectDialog orgId={orgId} />}
      />
      <Hydrate>
        <ProjectsList orgId={orgId} />
      </Hydrate>
    </>
  );
}
