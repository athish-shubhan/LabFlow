/** Pure helpers for the /bff/api/* proxy route (kept out of route.ts, which may only export handlers). */

/** How long the proxy waits for the backend before answering 504. */
export const BFF_TIMEOUT_MS = 15_000;

/**
 * Backend URL for a proxied request, or null if the path must not be forwarded.
 *
 * Only `/api/...` is proxied. Empty, `.` and `..` segments are rejected: `new URL()`
 * would otherwise normalise `api/../openapi.json` to `/openapi.json` and forward a
 * request outside `/api` with the user's bearer token attached.
 */
export function backendTarget(baseUrl: string, path: string[], search: string): URL | null {
  if (path[0] !== "api") return null;
  if (path.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  const target = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.map(encodeURIComponent).join("/")}`);
  target.search = search;
  return target;
}
