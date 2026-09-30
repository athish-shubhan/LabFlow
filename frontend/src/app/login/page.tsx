import type { Metadata } from "next";
import { FlaskConicalIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// Seeded by backend/scripts/seed.py (synthetic data, demo-only accounts).
const DEMO_ACCOUNTS = [
  { org: "Acme Labs", email: "admin@acme-labs.dev" },
  { org: "Helix Bio", email: "admin@helix-bio.dev" },
];
const DEMO_PASSWORD = "labflow-demo";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, reason } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="grid w-full max-w-sm gap-6">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
          <FlaskConicalIcon className="size-5" aria-hidden />
          LabFlow
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>Sign in</h1>
            </CardTitle>
            <CardDescription>
              {reason === "expired" ? "Your session expired. Sign in again to continue." : "Sign in to your research workspace."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={typeof next === "string" ? next : undefined} />
          </CardContent>
        </Card>

        <section aria-labelledby="demo-heading" className="rounded-lg border bg-background p-4 text-sm">
          <h2 id="demo-heading" className="font-medium">
            Demo credentials
          </h2>
          <p className="mt-1 text-muted-foreground">Synthetic data. Each account sees only its own organization.</p>
          <dl className="mt-3 grid gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <div key={a.email} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <dt className="text-muted-foreground">{a.org}</dt>
                <dd className="font-mono text-xs">{a.email}</dd>
              </div>
            ))}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-t pt-2">
              <dt className="text-muted-foreground">Password (both)</dt>
              <dd className="font-mono text-xs">{DEMO_PASSWORD}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
