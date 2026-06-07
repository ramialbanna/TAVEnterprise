"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { getAppMe } from "@/lib/app-api/client";
import { isAdminRole } from "@/lib/app-shell/nav-new";
import { queryKeys } from "@/lib/query";

/**
 * Non-admins are redirected away from ops-only pages.
 */
export function NewModeOpsGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
  });

  const blocked = meQuery.data?.ok === true && !isAdminRole(meQuery.data.data.role);

  useEffect(() => {
    if (blocked) router.replace("/opportunities");
  }, [blocked, router]);

  if (meQuery.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (blocked) return null;

  return <>{children}</>;
}
