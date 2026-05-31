"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Wrench } from "lucide-react";

import { getAppMe } from "@/lib/app-api/client";
import {
  analyticsNavItem,
  buyerNavItems,
  isAdminRole,
  navLinkActive,
  opsNavItems,
  type NavLinkItem,
} from "@/lib/app-shell/nav-new";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";

function NavLink({
  item,
  pathname,
  search,
  showLabel,
  onNavigate,
}: {
  item: NavLinkItem;
  pathname: string;
  search: string;
  showLabel: boolean;
  onNavigate?: () => void;
}) {
  const active = navLinkActive(item, pathname, search);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn("truncate", showLabel ? "inline" : "sr-only")}>{item.label}</span>
    </Link>
  );
}

/**
 * New-mode sidebar — buyer-first nav, Analytics, ops under More tools (admin only).
 * Labels visible from `md` (not icon-only rail).
 */
export function SidebarNavNew({
  labels,
  onNavigate,
}: {
  labels: "responsive" | "always";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const showLabel = labels === "always" || labels === "responsive";

  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });
  const role = meQuery.data?.ok ? meQuery.data.data.role : undefined;
  const showOps = isAdminRole(role);

  const [opsOpen, setOpsOpen] = useState(() =>
    opsNavItems().some((item) => navLinkActive(item, pathname, search)),
  );

  const buyer = buyerNavItems();
  const analytics = analyticsNavItem();
  const ops = opsNavItems();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          TAV
        </span>
        <span className={cn("text-sm font-semibold tracking-tight", showLabel ? "inline" : "sr-only")}>
          Acquisition Intel
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {buyer.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            search={search}
            showLabel={showLabel}
            onNavigate={onNavigate}
          />
        ))}
        <NavLink
          item={analytics}
          pathname={pathname}
          search={search}
          showLabel={showLabel}
          onNavigate={onNavigate}
        />

        {showOps ? (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setOpsOpen((v) => !v)}
              aria-expanded={opsOpen}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Wrench className="size-4 shrink-0" />
              <span className={cn("flex-1 truncate text-left", showLabel ? "inline" : "sr-only")}>
                More tools
              </span>
              <ChevronDown
                className={cn("size-4 shrink-0 transition-transform", opsOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            {opsOpen ? (
              <div className="mt-1 space-y-1 border-l border-border pl-2 ml-5">
                {ops.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    search={search}
                    showLabel={showLabel}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </nav>
    </div>
  );
}
