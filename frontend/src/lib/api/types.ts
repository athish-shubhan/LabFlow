// Friendly aliases over the generated OpenAPI types (src/lib/api/schema.d.ts).
// Nothing here is hand-written shape: every type is derived from the backend schema.
import type { components } from "./schema";

type Schemas = components["schemas"];

export type Organization = Schemas["OrganizationOut"];
export type User = Schemas["UserOut"];
export type TokenResponse = Schemas["TokenResponse"];
export type Dashboard = Schemas["DashboardOut"];
export type RecentExperiment = Schemas["RecentExperiment"];
export type RecentMeasurement = Schemas["RecentMeasurement"];
export type Project = Schemas["ProjectOut"];
export type ProjectCreate = Schemas["ProjectCreate"];
export type Experiment = Schemas["ExperimentOut"];
export type ExperimentCreate = Schemas["ExperimentCreate"];
export type ExperimentUpdate = Schemas["ExperimentUpdate"];
export type ExperimentStatus = Schemas["ExperimentStatus"];
export type Sample = Schemas["SampleOut"];
export type SampleCreate = Schemas["SampleCreate"];
export type SampleStatus = Schemas["SampleStatus"];
export type Measurement = Schemas["MeasurementOut"];
export type MeasurementCreate = Schemas["MeasurementCreate"];
export type MeasurementPage = Schemas["MeasurementPage"];
export type ExperimentAnalytics = Schemas["ExperimentAnalytics"];
export type AnalyticsSeries = Schemas["AnalyticsSeries"];
export type SeriesPoint = Schemas["SeriesPoint"];
export type SeriesStats = Schemas["SeriesStats"];

// Runtime lists of enum values. `satisfies` + the exhaustiveness checks below make
// `npm run typecheck` fail if the backend adds or renames a status and the types are regenerated.
export const EXPERIMENT_STATUSES = ["planned", "running", "completed", "archived"] as const satisfies readonly ExperimentStatus[];
export const SAMPLE_STATUSES = ["pending", "in_progress", "complete"] as const satisfies readonly SampleStatus[];

type Exhaustive<Union, List extends readonly unknown[]> = [Union] extends [List[number]] ? true : never;
const experimentStatusesExhaustive: Exhaustive<ExperimentStatus, typeof EXPERIMENT_STATUSES> = true;
const sampleStatusesExhaustive: Exhaustive<SampleStatus, typeof SAMPLE_STATUSES> = true;
void experimentStatusesExhaustive;
void sampleStatusesExhaustive;
