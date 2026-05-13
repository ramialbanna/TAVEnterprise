"use client";

import { useQuery } from "@tanstack/react-query";

import { getSystemStatus } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { SystemStatus } from "@/lib/app-api/schemas";
import { queryKeys, SYSTEM_STATUS_REFETCH_MS } from "@/lib/query";
import { StatusPill, type OperationalStatus } from "@/components/status";

import { renderApiResult } from "./render-api-result";

/**
 * `/app/system-status` poll, seeded by the RSC first-paint result. The pill is a
 * minimal health summary for Task 2.1 — full source/staleSweep breakdown lands in
 * Task 2.3 (system-health pill).
 */
export function SystemStatusSection({ initial }: { initial: ApiResult<SystemStatus> }) {
  const query = useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: () => getSystemStatus(),
    initialData: initial,
    refetchInterval: SYSTEM_STATUS_REFETCH_MS,
  });

  return (
    <div className="flex items-center gap-2" aria-label="System status">
      {renderApiResult(
        query.data,
        (data) => {
          const { status, label } = summarizeStatus(data);
          return <StatusPill status={status}>{label}</StatusPill>;
        },
        { onRetry: () => void query.refetch() },
      )}
    </div>
  );
}

function summarizeStatus(data: SystemStatus): { status: OperationalStatus; label: string } {
  if (!data.db.ok) return { status: "error", label: "Database unavailable" };
  return { status: "healthy", label: "Operational" };
}
