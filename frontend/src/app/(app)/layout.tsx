import { Building2Icon, FlaskConicalIcon, LogOutIcon } from "lucide-react";
import Link from "next/link";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NavLinks } from "@/components/shell/nav-links";
import { Button } from "@/components/ui/button";
import { unwrap } from "@/lib/api/client";
import { getServerApi, handleServerApiError, requireSession } from "@/lib/api/server";
import { logout } from "../login/actions";

// Server Component: the shell needs the org, user and project list once per session
// and has no interactivity beyond links, so it is fetched and rendered on the server.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { orgId } = await requireSession();
  const api = await getServerApi();
  const [orgs, me, projects] = await Promise.all([
    unwrap(api.GET("/api/organizations")),
    unwrap(api.GET("/api/auth/me")),
    unwrap(api.GET("/api/organizations/{org_id}/projects", { params: { path: { org_id: orgId } } })),
  ]).catch(handleServerApiError);

  const org = orgs[0];
  const navProjects = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:outline-2 focus:outline-ring"
      >
        Skip to content
      </a>

      <aside className="hidden border-r bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:gap-6 lg:p-4">
        <Link href="/" className="flex items-center gap-2 px-2 font-semibold">
          <FlaskConicalIcon className="size-5" aria-hidden />
          LabFlow
        </Link>
        <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-2 text-sm">
          <Building2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Workspace</p>
            <p className="truncate font-medium">{org.name}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLinks projects={navProjects} />
        </div>
        <div className="border-t pt-3 text-sm">
          <p className="truncate px-2 font-medium">{me.name}</p>
          <p className="truncate px-2 text-xs text-muted-foreground">{me.email}</p>
          <form action={logout} className="mt-2">
            <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
              <LogOutIcon aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <MobileNav projects={navProjects} orgName={org.name} />
          <span className="font-semibold">LabFlow</span>
          <span className="ml-auto truncate text-sm text-muted-foreground">{org.name}</span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
              <LogOutIcon aria-hidden />
            </Button>
          </form>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-6 outline-none sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
