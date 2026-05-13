import type { SystemStatus } from "@/lib/app-api/schemas";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingBackendState } from "@/components/data-state";

/**
 * Feature flags surfaced to the admin page.
 *   - `MANHEIM_LOOKUP_MODE` mirrors `intelWorker.mode` ("worker" | "direct").
 *   - `HYBRID_BUYBOX_ENABLED` isn't exposed by `/app/system-status` yet → PendingBackend.
 */
export function FeatureFlags({ intelWorker }: { intelWorker: SystemStatus["intelWorker"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature flags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-2">
          <dt className="font-mono text-xs">MANHEIM_LOOKUP_MODE</dt>
          <dd>
            <Badge variant="neutral" className="font-mono">
              {intelWorker.mode}
            </Badge>
          </dd>
          <dt className="font-mono text-xs">HYBRID_BUYBOX_ENABLED</dt>
          <dd>
            <PendingBackendState
              size="inline"
              label="HYBRID_BUYBOX_ENABLED — not exposed by /app/system-status yet"
            />
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
