import { afterEach, describe, expect, it, vi } from "vitest";
import { queries } from "@/lib/queries";
import { ApiError, createApiClient, toApiError, unwrap } from "./client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clientReturning(response: Response | Error) {
  const fetch = vi.fn(async (req: Request) => {
    void req; // recorded in fetch.mock.calls
    if (response instanceof Error) throw response;
    return response;
  });
  return { api: createApiClient({ baseUrl: "http://api.test", fetch }), fetch };
}

afterEach(() => vi.restoreAllMocks());

describe("unwrap", () => {
  it("returns typed data on success", async () => {
    const { api } = clientReturning(jsonResponse(200, [{ id: "o1", name: "Acme Labs", slug: "acme", created_at: "x" }]));
    const orgs = await unwrap(api.GET("/api/organizations"));
    expect(orgs[0].name).toBe("Acme Labs");
  });

  it("maps LabFlow's 422 body onto field errors", async () => {
    const { api } = clientReturning(
      jsonResponse(422, {
        detail: "Request validation failed",
        errors: [{ location: "body", field: "end_date", message: "end_date must be on or after start_date" }],
      }),
    );
    const err = await unwrap(
      api.PATCH("/api/experiments/{experiment_id}", {
        params: { path: { experiment_id: "e1" } },
        body: { start_date: "2026-09-10", end_date: "2026-01-01" },
      }),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(422);
    // With a single field error, the message is that error rather than the generic detail.
    expect(apiErr.message).toBe("end_date must be on or after start_date");
    expect(apiErr.bodyFieldErrors()).toEqual({ end_date: "end_date must be on or after start_date" });
    expect(apiErr.isNotFound).toBe(false);
  });

  it("flags 401 as unauthorized and keeps the backend's message", async () => {
    const { api } = clientReturning(jsonResponse(401, { detail: "Invalid or expired token" }));
    const err = (await unwrap(api.GET("/api/auth/me")).catch((e: unknown) => e)) as ApiError;
    expect(err.isUnauthorized).toBe(true);
    expect(err.message).toBe("Invalid or expired token");
  });

  it("treats 404 and malformed path ids (422 in 'path') as not found", async () => {
    expect(toApiError(404, { detail: "Experiment not found" }).isNotFound).toBe(true);
    const pathErr = toApiError(422, {
      detail: "Request validation failed",
      errors: [{ location: "path", field: "experiment_id", message: "Input should be a valid UUID" }],
    });
    expect(pathErr.isNotFound).toBe(true);
    expect(pathErr.bodyFieldErrors()).toEqual({});
  });

  it("understands FastAPI's stock {detail: [{loc, msg}]} shape too", () => {
    const err = toApiError(422, { detail: [{ loc: ["body", "name"], msg: "Field required", type: "missing" }] });
    expect(err.bodyFieldErrors()).toEqual({ name: "Field required" });
  });

  it("falls back to a readable message when the body is not JSON", async () => {
    const { api } = clientReturning(new Response("<html>Bad gateway</html>", { status: 502 }));
    const err = (await unwrap(api.GET("/api/organizations")).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.message).toBe("Request failed (502).");
  });

  it("turns network failures into an ApiError with status 0", async () => {
    const { api } = clientReturning(new TypeError("fetch failed"));
    const err = (await unwrap(api.GET("/api/organizations")).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/Could not reach/);
  });
});

describe("query functions", () => {
  it("send analytics filters as the backend's query parameters", async () => {
    const { api, fetch } = clientReturning(jsonResponse(200, { experiment_id: "e1", available_metrics: [], series: [] }));
    const options = queries.analytics(api, "e1", {
      metric: "yield",
      sampleIds: ["a", "b"],
      from: "2026-09-24T18:30:00.000Z",
    });
    await options.queryFn!({} as never);

    const url = new URL(fetch.mock.calls[0][0].url);
    expect(url.pathname).toBe("/api/experiments/e1/analytics");
    expect(url.searchParams.get("metric")).toBe("yield");
    expect(url.searchParams.get("sample_ids")).toBe("a,b");
    expect(url.searchParams.get("from")).toBe("2026-09-24T18:30:00.000Z");
    expect(url.searchParams.has("to")).toBe(false);
    expect(options.queryKey).toEqual(["experiment", "e1", "analytics", { metric: "yield", sampleIds: ["a", "b"], from: "2026-09-24T18:30:00.000Z" }]);
  });

  it("request measurements with server-side pagination parameters", async () => {
    const { api, fetch } = clientReturning(jsonResponse(200, { items: [], total: 0, page: 3, page_size: 50, pages: 0 }));
    await queries.measurements(api, "s1", { page: 3, pageSize: 50, order: "desc", metric: "ph" }).queryFn!({} as never);
    const url = new URL(fetch.mock.calls[0][0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({ metric: "ph", page: "3", page_size: "50", order: "desc" });
  });
});
