"use client";

import { useQuery } from "@tanstack/react-query";

import { getAppMe } from "@/lib/app-api/client";
import type { EnvLabel } from "@/lib/env";
import { queryKeys } from "@/lib/query";

import { EnvBadgeNew } from "./env-badge-new";

export function EnvBadgeShell({ label }: { label: EnvLabel }) {
  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
    staleTime: 60_000,
  });
  const role = meQuery.data?.ok ? meQuery.data.data.role : undefined;

  return <EnvBadgeNew label={label} role={role} />;
}
