"use client";

import type * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { getSystemStatus } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { SystemStatus } from "@/lib/app-api/schemas";
import { queryKeys, SYSTEM_STATUS_REFETCH_MS } from "@/lib/query";
import { Button } from "@/components/ui/button";
import { CaveatBanner } from "@/components/status";
import {
  ErrorState,
  PendingBackendState,
  UnavailableState,
} from "@/components/data-state";

import { ApiHealth } from "./api-health";
import { IntelWorker } from "./intel-worker";
import { SourceHealthTable } from "./source-health-table";
import { StaleSweep } from "./stale-sweep";
import { SecretsChecklist } from "./secrets-checklist";
import { FeatureFlags } from "./feature-flags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const COX_CAVEAT_TEXT =
  "Cox MMR is currently sandbox-backed in production until Cox enables true production MMR credentials.";

/**
 * Client wrapper around the live `/app/system-status` poll. Seeds TanStack Query with the
 * server-fetched initial result and renders every section that depends on it. The
 * "Refresh system status" button invalidates `queryKeys.systemStatus` only — no other
 * query is touched. Cox sandbox caveat is rendered persistently, never dismissible.
 */
export function AdminClient({ initial }: { initial: ApiResult<SystemStatus> }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: () => getSystemStatus(),
    initialData: initial,
    refetchInterval: SYSTEM_STATUS_REFETCH_MS,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">System health</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.systemStatus });
          }}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh system status
        </Button>
      </div>

      <CaveatBanner tone="caution" title="Cox / Manheim environment">
        {COX_CAVEAT_TEXT}
      </CaveatBanner>

      <Card>
        <CardHeader>
          <CardTitle>Cox / Manheim</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            Cox environment: <span className="font-semibold">Sandbox-backed</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            (No machine-readable Cox-environment flag is exposed by /app/system-status yet —
            this label is tied to the standing caveat above.)
          </p>
        </CardContent>
      </Card>

      {renderStatus(query.data, () => void query.refetch(), (data) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <ApiHealth data={data} />
            <IntelWorker data={data.intelWorker} />
            <StaleSweep data={data.staleSweep} />
            <FeatureFlags intelWorker={data.intelWorker} />
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Source-run health</CardTitle>
                </CardHeader>
                <CardContent>
                  <SourceHealthTable data={data} />
                </CardContent>
              </Card>
            </div>
            <SecretsChecklist intelWorker={data.intelWorker} />
            <Card>
              <CardHeader>
                <CardTitle>Operational placeholders</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <PendingBackendState
                  size="inline"
                  label="Last successful MMR lookup — not exposed by /app/system-status yet"
                />
                <PendingBackendState
                  size="inline"
                  label="Last ingest — partial coverage via Source-run health above"
                />
                <PendingBackendState
                  size="inline"
                  label="Last sales upload — not exposed by /app/system-status yet"
                />
                <PendingBackendState
                  size="inline"
                  label="Error-log summary — not exposed by /app/system-status yet"
                />
              </CardContent>
            </Card>
          </div>
        ))}
    </div>
  );
}

function renderStatus(
  result: ApiResult<SystemStatus>,
  onRetry: () => void,
  renderOk: (data: SystemStatus) => React.ReactNode,
): React.ReactNode {
  if (result.ok) return renderOk(result.data);
  if (result.kind === "unavailable") {
    return <UnavailableState code={result.error} title="System status unavailable" />;
  }
  return <ErrorState error={result} onRetry={onRetry} />;
}
