"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { browserApi } from "@/lib/api/browser";
import { queries } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function ExperimentHeader({ experimentId, project }: { experimentId: string; project: { id: string; name: string } }) {
  const pathname = usePathname();
  // Hydrated by the server layout, so this is populated on first render.
  const { data: experiment } = useQuery(queries.experiment(browserApi, experimentId));
  const base = `/experiments/${experimentId}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/analytics`, label: "Analytics" },
    { href: `${base}/measurements`, label: "Measurements" },
  ];
  const current = tabs.find((t) => t.href === pathname);
  const name = experiment?.name ?? "Experiment";

  return (
    <>
      <PageHeader
        title={name}
        meta={experiment && <StatusBadge status={experiment.status} />}
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: name, href: current?.href === base ? undefined : base },
          ...(current && current.href !== base ? [{ label: current.label }] : []),
        ]}
      />
      <nav aria-label="Experiment sections" className="mb-6 border-b">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.href === pathname;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-block border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                    active
                      ? "border-foreground font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
