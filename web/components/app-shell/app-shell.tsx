"use client";

import { useState, type ReactNode } from "react";
import type { EnvLabel } from "@/lib/env";
import { AppSidebar, MobileSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import type { SessionUser } from "./user-menu";

export function AppShell({
  envLabel,
  user,
  children,
}: {
  envLabel: EnvLabel;
  user: SessionUser | null;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <AppSidebar />
      <MobileSidebar open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar envLabel={envLabel} user={user} onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
