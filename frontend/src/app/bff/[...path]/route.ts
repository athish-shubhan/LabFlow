import { NextResponse, type NextRequest } from "next/server";
import { backendUrl } from "@/lib/api/server";
import { SESSION_COOKIE } from "@/lib/auth/token";

// Backend-for-frontend proxy: the browser calls /bff/api/..., this handler adds the
// bearer token from the httpOnly session cookie and forwards to the FastAPI backend.

async function forward(request: NextRequest, { params }: RouteContext<"/bff/[...path]">) {
  const { path } = await params;
  if (path[0] !== "api") {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const target = new URL(`${backendUrl()}/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;

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
    });
  } catch {
    return NextResponse.json({ detail: "The LabFlow API is unreachable." }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
