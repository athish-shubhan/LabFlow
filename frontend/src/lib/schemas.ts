import { z } from "zod";
import {
  EXPERIMENT_STATUSES,
  SAMPLE_STATUSES,
  type ExperimentUpdate,
  type ExperimentCreate,
  type MeasurementCreate,
  type SampleCreate,
} from "@/lib/api/types";

// Client-side mirrors of the backend's Pydantic rules (backend/app/schemas.py).
// The backend remains the authority; server-side 422s are mapped back onto fields too.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const optionalDate = z
  .string()
  .refine((v) => v === "" || (ISO_DATE.test(v) && !Number.isNaN(Date.parse(v))), "Enter a valid date");

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Password is required").max(128, "Password is too long"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const experimentFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200, "Name must be at most 200 characters"),
    description: z.string().trim().max(5000, "Description must be at most 5000 characters"),
    status: z.enum(EXPERIMENT_STATUSES, { error: "Choose a valid status" }),
    start_date: optionalDate,
    end_date: optionalDate,
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    // ISO yyyy-mm-dd strings compare correctly as strings.
    path: ["end_date"],
    message: "End date must be on or after the start date",
  });
export type ExperimentFormValues = z.infer<typeof experimentFormSchema>;

/** Form values -> PATCH/POST body: empty strings become null so fields can be cleared. */
export function toExperimentPayload(values: ExperimentFormValues): ExperimentUpdate & ExperimentCreate {
  return {
    name: values.name.trim(),
    description: values.description.trim() === "" ? null : values.description.trim(),
    status: values.status,
    start_date: values.start_date || null,
    end_date: values.end_date || null,
  };
}

export const sampleFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be at most 200 characters"),
  type: z.string().trim().min(1, "Type is required").max(100, "Type must be at most 100 characters"),
  status: z.enum(SAMPLE_STATUSES, { error: "Choose a valid status" }),
});
export type SampleFormValues = z.infer<typeof sampleFormSchema>;

export function toSamplePayload(values: SampleFormValues): SampleCreate {
  return { name: values.name.trim(), type: values.type.trim(), status: values.status };
}

export const METRIC_PATTERN = /^[a-z][a-z0-9_]*$/;

export const metricNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Metric is required")
  .max(64, "Metric must be at most 64 characters")
  .regex(METRIC_PATTERN, "Use lowercase letters, digits and underscores, starting with a letter");

export const measurementFormSchema = z.object({
  // Value of an <input type="datetime-local">, interpreted in the browser's time zone.
  timestamp: z
    .string()
    .min(1, "Timestamp is required")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date and time"),
  metric: metricNameSchema,
  value: z.number({ error: "Enter a number" }).refine(Number.isFinite, "Enter a finite number"),
  unit: z.string().trim().min(1, "Unit is required").max(32, "Unit must be at most 32 characters"),
});
export type MeasurementFormValues = z.input<typeof measurementFormSchema>;

export function toMeasurementPayload(values: z.output<typeof measurementFormSchema>): MeasurementCreate {
  return {
    // toISOString() is UTC with a Z suffix, which satisfies the backend's AwareDatetime.
    timestamp: new Date(values.timestamp).toISOString(),
    metric: values.metric,
    value: values.value,
    unit: values.unit.trim(),
  };
}
