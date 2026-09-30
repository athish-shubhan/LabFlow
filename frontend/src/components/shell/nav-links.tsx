"use client";

import { FolderKanbanIcon, LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavProject {
  id: string;
  name: string;
}

const linkBase =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring";
const linkActive = "bg-sidebar-accent font-medium text-sidebar-accent-foreground";

// Client component only because the active link depends on the current pathname.
export function NavLinks({ projects, onNavigate }: { projects: NavProject[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href);

  return (
    <nav aria-label="Main" className="grid gap-4">
      <ul className="grid gap-0.5">
        {[
          { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
          { href: "/projects", label: "Projects", icon: FolderKanbanIcon },
        ].map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(linkBase, isActive(href) && linkActive)}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
      {projects.length > 0 && (
        <div>
          <h2 id="nav-projects" className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Projects
          </h2>
          <ul aria-labelledby="nav-projects" className="grid gap-0.5">
            {projects.map((p) => {
              const href = `/projects/${p.id}`;
              return (
                <li key={p.id}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={cn(linkBase, "truncate", isActive(href) && linkActive)}
                  >
                    <span className="truncate">{p.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}
