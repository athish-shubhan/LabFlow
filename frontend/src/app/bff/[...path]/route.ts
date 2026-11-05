import { NextResponse, type NextRequest } from "next/server";
import { BFF_TIMEOUT_MS, backendTarget } from "@/lib/api/bff";
import { backendUrl } from "@/lib/api/server";
import { SESSION_COOKIE } from "@/lib/auth/token";

// Backend-for-frontend proxy: the browser calls /bff/api/..., this handler adds the
// bearer token from the httpOnly session cookie and forwards to the FastAPI backend.

async function forward(request: NextRequest, { params }: RouteContext<"/bff/[...path]">) {
  const { path } = await params;
  const target = backendTarget(backendUrl(), path, request.nextUrl.search);
  if (!target) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(BFF_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ detail: "The LabFlow API did not respond in time." }, { status: 504 });
    }
    return NextResponse.json({ detail: "The LabFlow API is unreachable." }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
