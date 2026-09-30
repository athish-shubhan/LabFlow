import { decodeJwt } from "jose";

export const SESSION_COOKIE = "labflow_session";

export interface TokenClaims {
  userId: string;
  orgId: string;
  expiresAt: number; // epoch seconds
}

/**
 * Read (not verify) the claims of a backend access token. The backend verifies the
 * signature on every request; the frontend only needs the org id and expiry to route.
 */
export function readTokenClaims(token: string | undefined, nowSeconds = Date.now() / 1000): TokenClaims | null {
  if (!token) return null;
  try {
    const claims = decodeJwt(token);
    if (typeof claims.sub !== "string" || typeof claims.org_id !== "string" || typeof claims.exp !== "number") {
      return null;
    }
    if (claims.exp <= nowSeconds) return null;
    return { userId: claims.sub, orgId: claims.org_id, expiresAt: claims.exp };
  } catch {
    return null;
  }
}

/** Only allow same-origin relative redirect targets after login. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
