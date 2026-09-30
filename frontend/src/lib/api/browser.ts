import { createApiClient } from "./client";

/**
 * Client for use in the browser. Requests go to this app's /bff route handler, which
 * attaches the bearer token from the httpOnly session cookie and forwards to the backend,
 * so the token is never readable by JavaScript.
 */
export const browserApi = createApiClient({ baseUrl: "/bff" });
