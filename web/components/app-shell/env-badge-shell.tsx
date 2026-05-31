"use client";

import { useQuery } from "@tanstack/react-query";

import { getAppMe } from "@/lib/app-api/client";
import type { EnvLabel } from "@/lib/env";
import { useInterface } from "@/lib/interface/interface-provider";
import { queryKeys } from "@/lib/query";

import { EnvBadge } from "./env-badge";
import { EnvBadgeNew } from "./env-badge-new";

export function EnvBadgeShell({ label }: { label: EnvLabel }) {
  const { interfaceMode } = useInterface();
  const meQuery = useQuery({
    queryKey: queryKeys.appMe,
    queryFn: getAppMe,
    staleTime: 60_000,
  });
  const role = meQuery.data?.ok ? meQuery.data.data.role : undefined;

  if (interfaceMode === "new") {
    return <EnvBadgeNew label={label} role={role} />;
  }

  return <EnvBadge label={label} />;
}
