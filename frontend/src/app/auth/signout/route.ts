import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/token";

// Clears the session cookie and sends the user to the login page. Used when the backend
// rejects a token (expired, or the database was reset) so the user doesn't loop between
// /login and a page that keeps getting 401s.
export function GET(request: NextRequest) {
  const url = new URL("/login", request.url);
  const reason = request.nextUrl.searchParams.get("reason");
  if (reason === "expired") url.searchParams.set("reason", "expired");
  const response = NextResponse.redirect(url);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
