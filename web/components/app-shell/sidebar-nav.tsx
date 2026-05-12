"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The brand mark + primary nav list. Shared by the static sidebar (rail/panel) and the
 * mobile drawer.
 *   - `labels="responsive"` → labels hidden below `xl` (icon rail on md→xl).
 *   - `labels="always"`     → labels always shown (used in the drawer).
 */
export function SidebarNav({
  labels,
  onNavigate,
}: {
  labels: "responsive" | "always";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const labelCls = labels === "always" ? "" : "hidden xl:inline";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          TAV
        </span>
        <span className={cn("text-sm font-semibold tracking-tight", labelCls)}>Acquisition Intel</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={label}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className={cn("truncate", labelCls)}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
