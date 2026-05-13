"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getSystemStatus } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { SystemStatus } from "@/lib/app-api/schemas";
import { queryKeys, SYSTEM_STATUS_REFETCH_MS } from "@/lib/query";
import { StatusPill } from "@/components/status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { renderApiResult } from "./render-api-result";
import { summarizeSystemStatus } from "./summarize-system-status";
import { SystemStatusDetail } from "./system-status-detail";

/**
 * `/app/system-status` poll, seeded from the RSC first-paint result. The pill is a
 * button — opening a Dialog with the full breakdown (DB, intel worker, stale sweep,
 * sources). Failures route through `renderApiResult` so `unavailable` and other
 * `ApiResult` failure kinds use the same dashboard-wide UnavailableState / ErrorState
 * primitives (with `query.refetch()` wired to ErrorState's Retry).
 *
 * Popover would be the ideal trigger surface but no `ui/popover.tsx` is vendored;
 * Dialog is the next-closest already-vendored primitive (Sheet would also work).
 */
export function SystemStatusSection({ initial }: { initial: ApiResult<SystemStatus> }) {
  const [open, setOpen] = useState(false);
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
          const health = summarizeSystemStatus(data);
          return (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  aria-label={`System status: ${health.label}. Open details.`}
                  className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <StatusPill status={health.status}>{health.label}</StatusPill>
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>System status</DialogTitle>
                  <DialogDescription>
                    Live breakdown of the dashboard&apos;s upstream subsystems.
                  </DialogDescription>
                </DialogHeader>
                <SystemStatusDetail data={data} health={health} />
              </DialogContent>
            </Dialog>
          );
        },
        { onRetry: () => void query.refetch() },
      )}
    </div>
  );
}
