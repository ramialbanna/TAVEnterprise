"use client";

import { useQuery } from "@tanstack/react-query";

import { getSystemStatus } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { SystemStatus } from "@/lib/app-api/schemas";
import { queryKeys, SYSTEM_STATUS_REFETCH_MS } from "@/lib/query";
import { KpiCard, KpiGrid } from "@/components/kpi";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import type { OperationalStatus } from "@/components/status";

import { MetricTile } from "./metric-tile";

/**
 * "Coming soon — pending backend" grid. The handful of tiles that ARE safely
 * derivable from `/app/system-status` (DB health, intel-worker mode + routing, source
 * ingest count + most-recent source) are promoted to live `MetricTile`s; everything
 * else stays a `KpiCard state="pending"`. Nothing is invented.
 *
 * Shares the system-status TanStack query key with `SystemStatusSection`, so the
 * 30s poll is deduped across both surfaces.
 */
export function FutureMetricsSection({ initial }: { initial: ApiResult<SystemStatus> }) {
  const query = useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: () => getSystemStatus(),
    initialData: initial,
    refetchInterval: SYSTEM_STATUS_REFETCH_MS,
  });

  return (
    <div className="space-y-3">
      <header>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Coming soon — pending backend
        </h2>
        <p className="text-xs text-muted-foreground">
          The tiles below are placeholders. A few items derivable from the live system
          status are filled in; the rest light up as backend endpoints land.
        </p>
      </header>

      {query.data.ok ? (
        <LiveAndPendingGrid data={query.data.data} />
      ) : query.data.kind === "unavailable" ? (
        <UnavailableState code={query.data.error} title="System status unavailable" />
      ) : (
        <ErrorState error={query.data} onRetry={() => void query.refetch()} />
      )}
    </div>
  );
}

function LiveAndPendingGrid({ data }: { data: SystemStatus }) {
  const dbStatus: OperationalStatus = data.db.ok ? "healthy" : "error";
  const dbValue = data.db.ok ? "Connected" : "Unavailable";

  const intel = data.intelWorker;
  const intelRouted = intel.binding || intel.url !== null;
  const intelStatus: OperationalStatus =
    intel.mode === "direct" ? "neutral" : intelRouted ? "healthy" : "review";
  const intelValue =
    intel.mode === "direct"
      ? "Direct (in-worker)"
      : intelRouted
        ? intel.binding
          ? "Worker · binding"
          : "Worker · HTTP"
        : "Worker · unrouted";

  const sourcesCount = data.sources.length;
  const sourcesStatus: OperationalStatus = sourcesCount > 0 ? "healthy" : "review";
  const mostRecent = pickMostRecentSource(data.sources);

  const mmrMode = intel.mode === "worker" ? "Worker" : "Direct";

  return (
    <KpiGrid>
      <MetricTile
        label="Supabase / API health"
        value={dbValue}
        status={dbStatus}
        sub={`Service ${data.service} v${data.version}`}
      />
      <MetricTile
        label="Cox / Manheim worker"
        value={intelValue}
        status={intelStatus}
        sub={intel.url ?? (intel.binding ? "Service binding" : intel.mode === "direct" ? "Inline lookup" : "No route configured")}
      />
      <MetricTile
        label="MMR routing mode"
        value={mmrMode}
        status={intel.mode === "worker" ? "healthy" : "neutral"}
      />
      <MetricTile
        label="Source ingest"
        value={`${formatNumber(sourcesCount)} configured`}
        status={sourcesStatus}
        sub={
          mostRecent
            ? `Most recent: ${mostRecent.source}${
                mostRecent.lastSeen ? ` · ${formatRelativeTime(mostRecent.lastSeen)}` : ""
              }`
            : "No sources reporting"
        }
      />

      <KpiCard label="Lead conversion rate" state="pending" />
      <KpiCard label="Avg appraisal accuracy" state="pending" />
      <KpiCard label="MMR cache hit rate" state="pending" />
      <KpiCard label="Stale-listing reclaim" state="pending" />
      <KpiCard label="Buyer pipeline" state="pending" />
      <KpiCard label="Transport SLA" state="pending" />
    </KpiGrid>
  );
}

/** Best-effort pick of the most recently active source row (defensive — RawRowSchema). */
function pickMostRecentSource(
  rows: SystemStatus["sources"],
): { source: string; lastSeen: string | null } | null {
  let best: { source: string; lastSeen: string | null; seen: number } | null = null;
  for (const row of rows) {
    const source = typeof row.source === "string" ? row.source : null;
    if (!source) continue;
    const seenRaw = row.last_seen_at;
    const seenStr = typeof seenRaw === "string" ? seenRaw : null;
    const seen = seenStr ? Date.parse(seenStr) : -Infinity;
    if (!best || (Number.isFinite(seen) && seen > best.seen)) {
      best = { source, lastSeen: seenStr, seen: Number.isFinite(seen) ? seen : -Infinity };
    }
  }
  return best ? { source: best.source, lastSeen: best.lastSeen } : null;
}
