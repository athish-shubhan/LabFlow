"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { browserApi } from "@/lib/api/browser";
import { unwrap } from "@/lib/api/client";
import type {
  Experiment,
  ExperimentCreate,
  ExperimentUpdate,
  MeasurementCreate,
  Project,
  ProjectCreate,
  Sample,
  SampleCreate,
} from "@/lib/api/types";
import { keys } from "@/lib/queries";

const api = browserApi;

export function useCreateProject(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectCreate) =>
      unwrap(api.POST("/api/organizations/{org_id}/projects", { params: { path: { org_id: orgId } }, body })),
    onSuccess: (project) => {
      // Backend lists newest first.
      qc.setQueryData<Project[]>(keys.projects(orgId), (old) => (old ? [project, ...old] : old));
      qc.invalidateQueries({ queryKey: keys.projects(orgId) });
    },
  });
}

export function useCreateExperiment(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ExperimentCreate) =>
      unwrap(api.POST("/api/projects/{project_id}/experiments", { params: { path: { project_id: projectId } }, body })),
    onSuccess: (experiment) => {
      qc.setQueryData(keys.experiment(experiment.id), experiment);
      // Experiment lists (all status filters) and the project's experiment_count.
      qc.invalidateQueries({ queryKey: keys.project(projectId) });
    },
  });
}

function onExperimentChanged(qc: ReturnType<typeof useQueryClient>, experiment: Experiment) {
  qc.setQueryData(keys.experiment(experiment.id), experiment);
  qc.invalidateQueries({ queryKey: keys.projectExperiments(experiment.project_id) });
}

export function useUpdateExperiment(experimentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ExperimentUpdate) =>
      unwrap(api.PATCH("/api/experiments/{experiment_id}", { params: { path: { experiment_id: experimentId } }, body })),
    onSuccess: (experiment) => onExperimentChanged(qc, experiment),
  });
}

export function useArchiveExperiment(experimentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(api.DELETE("/api/experiments/{experiment_id}", { params: { path: { experiment_id: experimentId } } })),
    onSuccess: (experiment) => onExperimentChanged(qc, experiment),
  });
}

export function useCreateSample(experimentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SampleCreate) =>
      unwrap(api.POST("/api/experiments/{experiment_id}/samples", { params: { path: { experiment_id: experimentId } }, body })),
    onSuccess: (sample) => {
      // Insert into the cached list right away (backend orders by name)...
      qc.setQueryData<Sample[]>(keys.samples(experimentId), (old) =>
        old ? [...old, sample].sort((a, b) => a.name.localeCompare(b.name)) : old,
      );
      // ...and refresh the experiment's sample_count. Not the samples list itself: it is already correct.
      qc.invalidateQueries({ queryKey: keys.experiment(experimentId), exact: true });
      qc.invalidateQueries({ queryKey: ["project"], predicate: (q) => q.queryKey[2] === "experiments" });
    },
  });
}

export function useCreateMeasurement(experimentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sampleId, body }: { sampleId: string; body: MeasurementCreate }) =>
      unwrap(api.POST("/api/samples/{sample_id}/measurements", { params: { path: { sample_id: sampleId } }, body })),
    onSuccess: (_measurement, { sampleId }) => {
      qc.invalidateQueries({ queryKey: keys.measurementsAll(sampleId) });
      qc.invalidateQueries({ queryKey: keys.samples(experimentId) }); // measurement_count
      qc.invalidateQueries({ queryKey: keys.analyticsAll(experimentId) });
    },
  });
}
