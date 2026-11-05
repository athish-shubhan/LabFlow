// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE } from "@/lib/auth/token";
import { GET, POST } from "./route";

interface CallOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  cookie?: string;
}

function call(handler: typeof GET, url: string, path: string[], { cookie, ...init }: CallOptions = {}) {
  const headers = new Headers(init.headers);
  if (cookie !== undefined) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  const request = new NextRequest(new URL(url, "http://localhost:3000"), { ...init, headers });
  return handler(request, { params: Promise.resolve({ path }) });
}

function stubFetch(impl: (input: URL, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("BFF proxy route", () => {
  it("forwards to the backend with the session token as a bearer header", async () => {
    const fetchMock = stubFetch(async () => Response.json([{ id: "o1" }]));
    const res = await call(GET, "/bff/api/organizations?page=2", ["api", "organizations"], { cookie: "tok" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "o1" }]);
    const [target, init] = fetchMock.mock.calls[0];
    expect(target.toString()).toBe("http://localhost:8000/api/organizations?page=2");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("forwards the body and content type of a write", async () => {
    const fetchMock = stubFetch(async () => Response.json({ id: "s1" }, { status: 201 }));
    const body = JSON.stringify({ name: "S1", type: "buffer" });
    const res = await call(POST, "/bff/api/experiments/e1/samples", ["api", "experiments", "e1", "samples"], {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      cookie: "tok",
    });
    expect(res.status).toBe(201);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("passes backend error statuses through unchanged", async () => {
    stubFetch(async () => Response.json({ detail: "Experiment not found" }, { status: 404 }));
    const res = await call(GET, "/bff/api/experiments/x", ["api", "experiments", "x"], { cookie: "tok" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Experiment not found" });
  });

  it("answers 401 without calling the backend when there is no session cookie", async () => {
    const fetchMock = stubFetch(async () => Response.json({}));
    const res = await call(GET, "/bff/api/organizations", ["api", "organizations"]);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not forward paths that escape /api", async () => {
    const fetchMock = stubFetch(async () => Response.json({}));
    const res = await call(GET, "/bff/api/x", ["api", "..", "openapi.json"], { cookie: "tok" });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a backend timeout to 504 and a connection failure to 502", async () => {
    stubFetch(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    const slow = await call(GET, "/bff/api/organizations", ["api", "organizations"], { cookie: "tok" });
    expect(slow.status).toBe(504);

    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const down = await call(GET, "/bff/api/organizations", ["api", "organizations"], { cookie: "tok" });
    expect(down.status).toBe(502);
    expect(await down.json()).toEqual({ detail: "The LabFlow API is unreachable." });
  });
});
