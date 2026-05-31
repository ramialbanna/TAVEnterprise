"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { getAppMe } from "@/lib/app-api/client";
import { isAdminRole } from "@/lib/app-shell/nav-new";
import { useInterface } from "@/lib/interface/interface-provider";
import { queryKeys } from "@/lib/query";

/**
 * In New mode, non-admins are redirected away from ops-only pages.
 * Classic mode is unchanged (all routes remain reachable).
 */
export function NewModeOpsGuard({ children }: { children: ReactNode }) {
  const { interfaceMode } = useInterface();
  const router = useRouter();
  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  const blocked =
    interfaceMode === "new" &&
    meQuery.data?.ok === true &&
    !isAdminRole(meQuery.data.data.role);

  useEffect(() => {
    if (blocked) router.replace("/opportunities");
  }, [blocked, router]);

  if (interfaceMode !== "new") return <>{children}</>;
  if (meQuery.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (blocked) return null;

  return <>{children}</>;
}
