"use client";

import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavLinks, type NavProject } from "./nav-links";

export function MobileNav({ projects, orgName }: { projects: NavProject[]; orgName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <MenuIcon aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-4">
        <SheetHeader className="p-0">
          <SheetTitle>LabFlow</SheetTitle>
          <SheetDescription>Workspace: {orgName}</SheetDescription>
        </SheetHeader>
        <NavLinks projects={projects} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
