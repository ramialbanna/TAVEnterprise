import type { SystemStatus } from "@/lib/app-api/schemas";
import { StatusPill } from "@/components/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type IntelWorkerData = SystemStatus["intelWorker"];

type Verdict = {
  status: "healthy" | "review";
  label: string;
};

/**
 * Derive the intel-worker StatusPill verdict from `intelWorker`. Pure — exported for
 * unit-test symmetry with `summarizeSystemStatus`.
 *
 * Phase-5 admin treats anything other than "routed worker mode" as a degraded pill so
 * the operator sees direct-mode + unrouted cases as actionable, not "fine".
 *
 *   - mode="worker" + binding=true                 → healthy, service-binding label
 *   - mode="worker" + url !== null                 → healthy, HTTP-routed label
 *   - mode="worker" + no binding + no url          → review,  "Worker mode — unrouted"
 *   - mode="direct"                                → review,  "Direct mode — degraded"
 */
export function deriveIntelVerdict(intel: IntelWorkerData): Verdict {
  if (intel.mode === "worker") {
    if (intel.binding) {
      return { status: "healthy", label: "Healthy / routed via worker, service binding active" };
    }
    if (intel.url !== null) {
      return { status: "healthy", label: "Healthy / routed via worker, HTTP routed" };
    }
    return { status: "review", label: "Worker mode — unrouted" };
  }
  return { status: "review", label: "Direct mode — degraded" };
}

export function IntelWorker({ data }: { data: IntelWorkerData }) {
  const verdict = deriveIntelVerdict(data);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Intelligence worker</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <StatusPill status={verdict.status}>{verdict.label}</StatusPill>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="font-medium uppercase tracking-wider text-muted-foreground">Mode</dt>
          <dd className="font-mono">{data.mode}</dd>
          <dt className="font-medium uppercase tracking-wider text-muted-foreground">Binding</dt>
          <dd>{data.binding ? "Yes" : "No"}</dd>
          <dt className="font-medium uppercase tracking-wider text-muted-foreground">URL</dt>
          <dd className="font-mono break-all">{data.url ?? "none"}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
