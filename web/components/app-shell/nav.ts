import type { Route } from "next";
import { Activity, Database, LayoutDashboard, Search, Settings, type LucideIcon } from "lucide-react";

export type NavItem = { href: Route; label: string; icon: LucideIcon };

/**
 * Primary navigation. Remaining v1.5 entries (Import Batches) are intentionally
 * omitted until those pages exist — do not render placeholders for them.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ingest", label: "Ingest Monitor", icon: Activity },
  { href: "/mmr-lab", label: "VIN / MMR Lab", icon: Search },
  { href: "/historical", label: "TAV Historical Data", icon: Database },
  { href: "/admin", label: "Admin / Integrations", icon: Settings },
];

/** Best-effort page title for a pathname (falls back to the app name). */
export function navTitle(pathname: string): string {
  const hit = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return hit?.label ?? "TAV Acquisition Intelligence";
}
