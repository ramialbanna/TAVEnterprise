import type { Route } from "next";
import {
  Activity,
  BarChart3,
  Briefcase,
  Database,
  Home,
  PlusCircle,
  Search,
  Settings,
  Target,
  type LucideIcon,
} from "lucide-react";

export type AppRole = "admin" | "closer" | "viewer";

export type NavLinkItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** When set, used instead of default prefix match on `href`. */
  isActive?: (pathname: string, search: string) => boolean;
};

export const NEW_HOME_HREF = "/dashboard" as const;
export const NEW_ANALYTICS_HREF = "/dashboard/analytics" as const;

export function buyerNavItems(): NavLinkItem[] {
  return [
    { href: NEW_HOME_HREF, label: "Home", icon: Home },
    {
      href: "/opportunities",
      label: "Opportunities",
      icon: Target,
      isActive: (pathname, search) => {
        if (new URLSearchParams(search).get("view") === "mine") return false;
        return (
          pathname === "/opportunities" ||
          (pathname.startsWith("/opportunities/") && !pathname.startsWith("/opportunities/submit"))
        );
      },
    },
    {
      href: "/opportunities/submit",
      label: "Submit listing",
      icon: PlusCircle,
      isActive: (pathname) => pathname.startsWith("/opportunities/submit"),
    },
    {
      href: "/mmr-lab",
      label: "MMR Lab",
      icon: Search,
      isActive: (pathname) => pathname.startsWith("/mmr-lab"),
    },
    {
      href: "/my-work",
      label: "My work",
      icon: Briefcase,
      isActive: (pathname, search) =>
        pathname === "/my-work" ||
        (pathname === "/opportunities" && new URLSearchParams(search).get("view") === "mine"),
    },
  ];
}

export function analyticsNavItem(): NavLinkItem {
  return {
    href: NEW_ANALYTICS_HREF,
    label: "Analytics",
    icon: BarChart3,
    isActive: (pathname) => pathname.startsWith("/dashboard/analytics"),
  };
}

export function opsNavItems(): NavLinkItem[] {
  return [
    { href: "/ingest", label: "Ingest Monitor", icon: Activity },
    { href: "/historical", label: "Historical data", icon: Database },
    { href: "/admin", label: "Admin", icon: Settings },
  ];
}

export function isAdminRole(role: AppRole | undefined): boolean {
  return role === "admin";
}

export function navLinkActive(
  item: NavLinkItem,
  pathname: string,
  search: string,
): boolean {
  if (item.isActive) return item.isActive(pathname, search);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const TITLE_ENTRIES: { match: (pathname: string) => boolean; label: string }[] = [
  { match: (p) => p.startsWith("/dashboard/analytics"), label: "Analytics" },
  { match: (p) => p === "/dashboard" || p.startsWith("/dashboard/"), label: "Home" },
  { match: (p) => p.startsWith("/opportunities/submit"), label: "Submit listing" },
  { match: (p) => p.startsWith("/mmr-lab"), label: "MMR Lab" },
  { match: (p) => p.startsWith("/maxbuy"), label: "MMR Lab" },
  { match: (p) => p === "/my-work", label: "My work" },
  { match: (p) => p.startsWith("/opportunities"), label: "Opportunities" },
  { match: (p) => p.startsWith("/ingest"), label: "Ingest Monitor" },
  { match: (p) => p.startsWith("/historical"), label: "Historical data" },
  { match: (p) => p.startsWith("/admin"), label: "Admin" },
];

/** Page title for New-mode shell (buyer-friendly labels). */
export function navTitleNew(pathname: string): string {
  const hit = TITLE_ENTRIES.find((e) => e.match(pathname));
  return hit?.label ?? "TAV Acquisition Intelligence";
}
