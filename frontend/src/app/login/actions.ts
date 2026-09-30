"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createApiClient, unwrap, ApiError } from "@/lib/api/client";
import { backendUrl } from "@/lib/api/server";
import { safeNextPath, SESSION_COOKIE } from "@/lib/auth/token";
import { loginSchema, type LoginValues } from "@/lib/schemas";

export type LoginResult = { error: string; fieldErrors?: Partial<Record<keyof LoginValues, string>> };

function cookieSecure() {
  // Secure by default in production; COOKIE_SECURE=false allows plain-http deployments
  // such as the local docker compose stack.
  if (process.env.COOKIE_SECURE) return process.env.COOKIE_SECURE === "true";
  return process.env.NODE_ENV === "production";
}

export async function login(values: LoginValues, next?: string): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Check the highlighted fields." };
  }

  const api = createApiClient({ baseUrl: backendUrl() });
  try {
    const session = await unwrap(api.POST("/api/auth/login", { body: parsed.data }));
    (await cookies()).set(SESSION_COOKIE, session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
      maxAge: session.expires_in,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) return { error: "Incorrect email or password." };
      if (err.status === 422) {
        const fields = err.bodyFieldErrors();
        return { error: "Check the highlighted fields.", fieldErrors: { email: fields.email, password: fields.password } };
      }
      if (err.status === 0) return { error: "The LabFlow API is unreachable. Is the backend running?" };
    }
    return { error: "Sign-in failed unexpectedly. Please try again." };
  }

  redirect(safeNextPath(next));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
