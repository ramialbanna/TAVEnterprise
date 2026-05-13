import type { SystemStatus } from "@/lib/app-api/schemas";
import { codeMessage } from "@/lib/app-api";
import { formatDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import { StatusPill } from "@/components/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Stale-sweep panel. Three render branches matching `staleSweep` shape:
 *   - ran + ok            → "Last run <relative> — OK — N updated"
 *   - ran + failed        → "Last run <relative> — Failed"
 *   - never ran           → "Never run" + the never_run rationale copy
 *   - missing (db_error)  → "Unavailable"
 */
export function StaleSweep({ data }: { data: SystemStatus["staleSweep"] }) {
  if (data.lastRunAt !== null) {
    const ok = data.status === "ok";
    const status = ok ? ("healthy" as const) : ("error" as const);
    const label = ok ? "OK" : "Failed";
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stale sweep</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status}>{label}</StatusPill>
            <span className="text-muted-foreground">
              Last run {formatRelativeTime(data.lastRunAt)}
              {data.updated !== null ? ` · ${formatNumber(data.updated)} updated` : ""}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{formatDateTime(data.lastRunAt)}</p>
        </CardContent>
      </Card>
    );
  }

  const isNever = data.missingReason === "never_run";
  const status = isNever ? ("review" as const) : ("error" as const);
  const label = isNever ? "Never run" : "Unavailable";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stale sweep</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <StatusPill status={status}>{label}</StatusPill>
        <p className="text-xs text-muted-foreground">{codeMessage(data.missingReason)}</p>
      </CardContent>
    </Card>
  );
}
