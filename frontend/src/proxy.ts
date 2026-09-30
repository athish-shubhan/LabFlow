import { NextResponse, type NextRequest } from "next/server";
import { readTokenClaims, SESSION_COOKIE } from "@/lib/auth/token";

// Optimistic route guard: redirect to /login when there is no unexpired session cookie.
// The backend still verifies the token on every API call; this only avoids rendering
// app pages for signed-out users.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = readTokenClaims(request.cookies.get(SESSION_COOKIE)?.value) !== null;

  if (pathname === "/login") {
    return signedIn ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!signedIn) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except static assets, the BFF proxy (answers 401 itself) and sign-out.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|bff/|auth/).*)"],
};
