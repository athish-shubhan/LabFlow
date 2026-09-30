import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { unwrap, type ApiClient } from "@/lib/api/client";
import type { ExperimentStatus } from "@/lib/api/types";

// Query key hierarchy. Keys nest under their parent resource so a single
// invalidateQueries({queryKey: keys.experiment(id)}) also refreshes that
// experiment's samples and analytics.
export const keys = {
  projects: (orgId: string) => ["org", orgId, "projects"] as const,
  project: (projectId: string) => ["project", projectId] as const,
  projectExperiments: (projectId: string) => ["project", projectId, "experiments"] as const,
  projectExperimentsByStatus: (projectId: string, status: ExperimentStatus | undefined) =>
    ["project", projectId, "experiments", { status: status ?? null }] as const,
  experiment: (experimentId: string) => ["experiment", experimentId] as const,
  samples: (experimentId: string) => ["experiment", experimentId, "samples"] as const,
  analyticsAll: (experimentId: string) => ["experiment", experimentId, "analytics"] as const,
  analytics: (experimentId: string, filters: AnalyticsFilters) => ["experiment", experimentId, "analytics", filters] as const,
  measurementsAll: (sampleId: string) => ["sample", sampleId, "measurements"] as const,
  measurements: (sampleId: string, filters: MeasurementFilters) => ["sample", sampleId, "measurements", filters] as const,
};

export interface AnalyticsFilters {
  metric?: string;
  sampleIds?: string[]; // sorted, so equal selections share a cache entry
  from?: string;
  to?: string;
}

export interface MeasurementFilters {
  metric?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  order: "asc" | "desc";
}

// Each factory takes the API client so the same definition serves both the server
// (prefetch with the bearer token) and the browser (via the /bff proxy).
export const queries = {
  projects: (api: ApiClient, orgId: string) =>
    queryOptions({
      queryKey: keys.projects(orgId),
      queryFn: () => unwrap(api.GET("/api/organizations/{org_id}/projects", { params: { path: { org_id: orgId } } })),
    }),

  project: (api: ApiClient, projectId: string) =>
    queryOptions({
      queryKey: keys.project(projectId),
      queryFn: () => unwrap(api.GET("/api/projects/{project_id}", { params: { path: { project_id: projectId } } })),
    }),

  projectExperiments: (api: ApiClient, projectId: string, status?: ExperimentStatus) =>
    queryOptions({
      queryKey: keys.projectExperimentsByStatus(projectId, status),
      queryFn: () =>
        unwrap(
          api.GET("/api/projects/{project_id}/experiments", {
            params: { path: { project_id: projectId }, query: { status } },
          }),
        ),
      placeholderData: keepPreviousData,
    }),

  experiment: (api: ApiClient, experimentId: string) =>
    queryOptions({
      queryKey: keys.experiment(experimentId),
      queryFn: () =>
        unwrap(api.GET("/api/experiments/{experiment_id}", { params: { path: { experiment_id: experimentId } } })),
    }),

  samples: (api: ApiClient, experimentId: string) =>
    queryOptions({
      queryKey: keys.samples(experimentId),
      queryFn: () =>
        unwrap(api.GET("/api/experiments/{experiment_id}/samples", { params: { path: { experiment_id: experimentId } } })),
    }),

  analytics: (api: ApiClient, experimentId: string, filters: AnalyticsFilters) =>
    queryOptions({
      queryKey: keys.analytics(experimentId, filters),
      queryFn: () =>
        unwrap(
          api.GET("/api/experiments/{experiment_id}/analytics", {
            params: {
              path: { experiment_id: experimentId },
              query: {
                metric: filters.metric,
                sample_ids: filters.sampleIds?.length ? filters.sampleIds.join(",") : undefined,
                from: filters.from,
                to: filters.to,
              },
            },
          }),
        ),
      // Keep the current chart on screen while a new filter combination loads.
      placeholderData: keepPreviousData,
    }),

  measurements: (api: ApiClient, sampleId: string, filters: MeasurementFilters) =>
    queryOptions({
      queryKey: keys.measurements(sampleId, filters),
      queryFn: () =>
        unwrap(
          api.GET("/api/samples/{sample_id}/measurements", {
            params: {
              path: { sample_id: sampleId },
              query: {
                metric: filters.metric,
                from: filters.from,
                to: filters.to,
                page: filters.page,
                page_size: filters.pageSize,
                order: filters.order,
              },
            },
          }),
        ),
      placeholderData: keepPreviousData,
    }),
};
