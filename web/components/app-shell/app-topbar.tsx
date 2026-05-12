"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { EnvLabel } from "@/lib/env";
import { navTitle } from "./nav";
import { EnvBadge } from "./env-badge";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu, type SessionUser } from "./user-menu";

export function AppTopbar({
  envLabel,
  user,
  onOpenMobileNav,
}: {
  envLabel: EnvLabel;
  user: SessionUser | null;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={onOpenMobileNav}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
      >
        <Menu className="size-4" />
      </button>
      <h1 className="truncate text-sm font-semibold tracking-tight">{navTitle(pathname)}</h1>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <EnvBadge label={envLabel} />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
