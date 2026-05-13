import type { SystemStatus } from "@/lib/app-api/schemas";
import { codeMessage } from "@/lib/app-api";
import { formatDateTime } from "@/lib/format";
import { StatusPill } from "@/components/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * API-health section: db status pill + service / version / timestamp.
 * No transient retry state here — the outer client wrapper owns refetch.
 */
export function ApiHealth({ data }: { data: SystemStatus }) {
  const dbOk = data.db.ok;
  const dbLabel = dbOk ? "Healthy" : "Database error";
  const dbStatus = dbOk ? ("healthy" as const) : ("error" as const);
  const dbDetail = dbOk ? null : codeMessage(data.db.missingReason ?? "db_error");

  return (
    <Card>
      <CardHeader>
        <CardTitle>API health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <StatusPill status={dbStatus}>{dbLabel}</StatusPill>
          {dbDetail ? <span className="text-xs text-muted-foreground">{dbDetail}</span> : null}
        </div>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="font-medium uppercase tracking-wider text-muted-foreground">Service</dt>
          <dd className="font-mono">{data.service}</dd>
          <dt className="font-medium uppercase tracking-wider text-muted-foreground">Version</dt>
          <dd className="font-mono">{data.version}</dd>
          <dt className="font-medium uppercase tracking-wider text-muted-foreground">Timestamp</dt>
          <dd>{formatDateTime(data.timestamp)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
