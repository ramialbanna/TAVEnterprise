"use client";

import type { ReactNode } from "react";

import type { SystemStatus } from "@/lib/app-api/schemas";
import { codeMessage } from "@/lib/app-api";
import { formatDateTime, formatRelativeTime, formatNumber } from "@/lib/format";
import { HealthDot, type OperationalStatus } from "@/components/status";

import type { SystemHealth } from "./summarize-system-status";

/**
 * Detail rows for the system-status dialog. Pure-presentational — takes the
 * `SystemStatus` payload plus its derived `SystemHealth` and renders a structured
 * read-out (DB / intel worker / stale sweep / sources count + most-recent source).
 *
 * Only documented fields are rendered. The Cloudflare-internal `intelWorker.url`
 * (a `*.workers.dev` URL, public by design) is shown for ops visibility; nothing
 * here is a secret. The `sources` payload is intentionally narrowed to two columns
 * (`source`, `last_seen_at`) so any future v_source_health additions can't leak.
 */
export function SystemStatusDetail({
  data,
  health,
}: {
  data: SystemStatus;
  health: SystemHealth;
}) {
  const dbStatus: OperationalStatus = data.db.ok ? "healthy" : "error";
  const dbLabel = data.db.ok ? "Connected" : codeMessage(data.db.missingReason ?? "db_error");

  const intel = data.intelWorker;
  const intelRouted = intel.binding || intel.url !== null;
  const intelStatus: OperationalStatus =
    intel.mode === "direct" ? "neutral" : intelRouted ? "healthy" : "review";
  const intelLabel =
    intel.mode === "direct"
      ? "Direct (in-worker)"
      : intelRouted
        ? intel.binding
          ? "Service binding"
          : "HTTP routed"
        : "Unrouted";

  const sweep = data.staleSweep;
  const sweepHasRun = sweep.lastRunAt !== null;
  const sweepStatus: OperationalStatus = sweepHasRun
    ? sweep.status === "ok"
      ? "healthy"
      : "error"
    : sweep.missingReason === "never_run"
      ? "review"
      : "error";

  const mostRecentSource = pickMostRecentSource(data.sources);

  return (
    <dl className="space-y-3 text-sm">
      <Row label="Status">
        <span className="flex items-center gap-2">
          <HealthDot status={health.status} />
          <span className="font-medium">{health.label}</span>
        </span>
      </Row>

      {health.reasons.length > 0 ? (
        <Row label="Reasons">
          <ul className="space-y-0.5">
            {health.reasons.map((r) => (
              <li key={r} className="text-xs text-muted-foreground">
                {codeMessage(r)}
              </li>
            ))}
          </ul>
        </Row>
      ) : null}

      <Row label="Database">
        <span className="flex items-center gap-2">
          <HealthDot status={dbStatus} />
          <span>{dbLabel}</span>
        </span>
      </Row>

      <Row label="Intel worker">
        <span className="flex items-center gap-2">
          <HealthDot status={intelStatus} />
          <span>
            {intel.mode === "worker" ? "Worker mode" : "Direct mode"} · {intelLabel}
          </span>
        </span>
        {intel.url ? <p className="mt-1 truncate text-xs text-muted-foreground">{intel.url}</p> : null}
      </Row>

      <Row label="Stale sweep">
        <span className="flex items-center gap-2">
          <HealthDot status={sweepStatus} />
          {sweepHasRun ? (
            <span>
              {sweep.status === "ok" ? "OK" : "Failed"} · {formatRelativeTime(sweep.lastRunAt)}
              {sweep.updated !== null ? ` · ${formatNumber(sweep.updated)} updated` : ""}
            </span>
          ) : (
            <span>{codeMessage(sweep.missingReason)}</span>
          )}
        </span>
        {sweepHasRun ? (
          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(sweep.lastRunAt)}</p>
        ) : null}
      </Row>

      <Row label="Sources">
        <span>
          {formatNumber(data.sources.length)} configured
          {mostRecentSource ? ` · most recent: ${mostRecentSource}` : ""}
        </span>
      </Row>

      <Row label="Service">
        <span className="text-xs text-muted-foreground">
          {data.service} v{data.version}
        </span>
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_1fr] items-start gap-x-4">
      <dt className="pt-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Best-effort pick of the most recently seen source from `data.sources`. Reads only
 * the documented `source` / `last_seen_at` columns; ignores any other field the view
 * may add so we never accidentally render an unexpected value.
 */
function pickMostRecentSource(rows: SystemStatus["sources"]): string | null {
  let bestName: string | null = null;
  let bestSeen = -Infinity;
  for (const row of rows) {
    const name = typeof row.source === "string" ? row.source : null;
    const seenRaw = row.last_seen_at;
    const seen = typeof seenRaw === "string" ? Date.parse(seenRaw) : NaN;
    if (name && Number.isFinite(seen) && seen > bestSeen) {
      bestSeen = seen;
      bestName = name;
    }
  }
  if (bestName) return bestName;
  const first = rows[0];
  return first && typeof first.source === "string" ? first.source : null;
}
