import { describe, expect, it } from "vitest";
import {
  experimentFormSchema,
  loginSchema,
  measurementFormSchema,
  sampleFormSchema,
  toExperimentPayload,
  toMeasurementPayload,
  type ExperimentFormValues,
} from "./schemas";

const valid: ExperimentFormValues = {
  name: "Pt/Al2O3 temperature sweep",
  description: "",
  status: "running",
  start_date: "2026-09-21",
  end_date: "2026-09-30",
};

function issues(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
}

describe("experimentFormSchema", () => {
  it("accepts a valid experiment", () => {
    expect(experimentFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a status outside the backend enum", () => {
    const result = experimentFormSchema.safeParse({ ...valid, status: "paused" });
    expect(result.success).toBe(false);
    expect(issues(result)).toEqual({ status: "Choose a valid status" });
  });

  it.each(["planned", "running", "completed", "archived"])("accepts status %s", (status) => {
    expect(experimentFormSchema.safeParse({ ...valid, status }).success).toBe(true);
  });

  it("rejects an end date before the start date, reported on end_date", () => {
    const result = experimentFormSchema.safeParse({ ...valid, start_date: "2026-09-21", end_date: "2026-09-20" });
    expect(result.success).toBe(false);
    expect(issues(result)).toEqual({ end_date: "End date must be on or after the start date" });
  });

  it("allows the end date to equal the start date (backend rule is end >= start)", () => {
    expect(experimentFormSchema.safeParse({ ...valid, start_date: "2026-09-21", end_date: "2026-09-21" }).success).toBe(true);
  });

  it("allows either date to be empty", () => {
    expect(experimentFormSchema.safeParse({ ...valid, start_date: "", end_date: "" }).success).toBe(true);
    expect(experimentFormSchema.safeParse({ ...valid, start_date: "", end_date: "2020-01-01" }).success).toBe(true);
  });

  it("rejects malformed dates", () => {
    const result = experimentFormSchema.safeParse({ ...valid, start_date: "21/09/2026" });
    expect(issues(result)).toEqual({ start_date: "Enter a valid date" });
  });

  it("requires a non-blank name of at most 200 characters", () => {
    expect(issues(experimentFormSchema.safeParse({ ...valid, name: "   " }))).toEqual({ name: "Name is required" });
    expect(issues(experimentFormSchema.safeParse({ ...valid, name: "x".repeat(201) }))).toEqual({
      name: "Name must be at most 200 characters",
    });
  });
});

describe("toExperimentPayload", () => {
  it("turns empty optional fields into null so they are cleared on PATCH", () => {
    expect(toExperimentPayload({ ...valid, name: "  Trimmed  ", description: "  ", start_date: "", end_date: "" })).toEqual({
      name: "Trimmed",
      description: null,
      status: "running",
      start_date: null,
      end_date: null,
    });
  });
});

describe("sampleFormSchema", () => {
  it("rejects an unknown sample status and a blank type", () => {
    const result = sampleFormSchema.safeParse({ name: "S1", type: " ", status: "done" });
    expect(issues(result)).toEqual({ type: "Type is required", status: "Choose a valid status" });
  });
});

describe("measurementFormSchema", () => {
  const base = { timestamp: "2026-09-30T10:15", metric: "temperature", value: 21.5, unit: "°C" };

  it("normalises the metric to lowercase like the backend", () => {
    const result = measurementFormSchema.parse({ ...base, metric: "  Dissolved_Oxygen " });
    expect(result.metric).toBe("dissolved_oxygen");
  });

  it("rejects metric names the backend pattern would reject", () => {
    for (const metric of ["2temp", "temp-c", "temp c", ""]) {
      expect(measurementFormSchema.safeParse({ ...base, metric }).success, metric).toBe(false);
    }
  });

  it("rejects NaN (empty number input) and infinite values", () => {
    expect(issues(measurementFormSchema.safeParse({ ...base, value: NaN }))).toEqual({ value: "Enter a number" });
    expect(measurementFormSchema.safeParse({ ...base, value: Infinity }).success).toBe(false);
  });

  it("produces a timezone-aware ISO timestamp for the API", () => {
    const payload = toMeasurementPayload(measurementFormSchema.parse(base));
    expect(payload.timestamp).toMatch(/Z$/);
    expect(new Date(payload.timestamp).getTime()).toBe(new Date("2026-09-30T10:15").getTime());
  });
});

describe("loginSchema", () => {
  it("validates email format and requires a password", () => {
    expect(issues(loginSchema.safeParse({ email: "not-an-email", password: "" }))).toEqual({
      email: "Enter a valid email address",
      password: "Password is required",
    });
  });
});
