import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { QueryClient } from "@tanstack/react-query";
import { readTokenClaims, SESSION_COOKIE } from "@/lib/auth/token";
import { ApiError, createApiClient } from "./client";

export function backendUrl() {
  return process.env.BACKEND_URL ?? "http://localhost:8000";
}

/** Session for the current request, or a redirect to /login. */
export const requireSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = readTokenClaims(token);
  if (!token || !claims) redirect("/login");
  return { token, ...claims };
});

/** Typed API client that calls the backend directly with the session's bearer token. */
export const getServerApi = cache(async () => {
  const { token } = await requireSession();
  return createApiClient({
    baseUrl: backendUrl(),
    headers: { Authorization: `Bearer ${token}` },
    // Per-user, frequently changing data: never use Next's fetch cache.
    fetch: (input: Request) => fetch(input, { cache: "no-store" }),
  });
});

/** One QueryClient per server request, used to prefetch data that client components hydrate. */
export const getServerQueryClient = cache(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));

/**
 * Translate API errors in Server Components into the matching Next.js behaviour:
 * expired token -> clear cookie and go to login, missing resource -> not-found page,
 * anything else -> the nearest error boundary.
 */
export function handleServerApiError(err: unknown): never {
  if (err instanceof ApiError) {
    if (err.isUnauthorized) redirect("/auth/signout?reason=expired");
    if (err.isNotFound) notFound();
  }
  throw err;
}
