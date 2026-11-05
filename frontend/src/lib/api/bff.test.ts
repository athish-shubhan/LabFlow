import { describe, expect, it } from "vitest";
import { backendTarget } from "./bff";

const BASE = "http://backend:8000";

describe("backendTarget", () => {
  it("forwards /api paths with the query string", () => {
    const url = backendTarget(BASE, ["api", "experiments", "e1", "analytics"], "?metric=ph&from=2026-01-01");
    expect(url?.toString()).toBe("http://backend:8000/api/experiments/e1/analytics?metric=ph&from=2026-01-01");
  });

  it("rejects anything outside /api", () => {
    expect(backendTarget(BASE, ["health"], "")).toBeNull();
    expect(backendTarget(BASE, ["openapi.json"], "")).toBeNull();
  });

  it.each([
    [["api", "..", "openapi.json"]],
    [["api", "x", "..", "..", "docs"]],
    [["api", ".", "organizations"]],
    [["api", "", "organizations"]],
  ])("rejects dot and empty segments that would escape /api: %j", (path) => {
    expect(backendTarget(BASE, path, "")).toBeNull();
  });

  it("encodes segments instead of letting them add path structure", () => {
    const url = backendTarget(BASE, ["api", "samples", "a/b?c"], "");
    expect(url?.pathname).toBe("/api/samples/a%2Fb%3Fc");
    expect(url?.search).toBe("");
  });

  it("tolerates a trailing slash on the backend URL", () => {
    expect(backendTarget(`${BASE}/`, ["api", "organizations"], "")?.toString()).toBe(`${BASE}/api/organizations`);
  });
});
