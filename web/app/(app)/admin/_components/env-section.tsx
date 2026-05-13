import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EnvLabel } from "@/lib/env";

/**
 * Shows the explicit environment the dashboard is talking to:
 *   - the `ENV_LABEL` from `serverEnv()` (PRODUCTION / STAGING / LOCAL) as a Badge,
 *   - the `/app/*` host only (origin host — never the secret, never the full URL with
 *     credentials), passed in from the RSC shell.
 *
 * Static, no client state. Lives alongside the other admin sections.
 */
export function EnvSection({
  envLabel,
  apiHost,
}: {
  envLabel: EnvLabel;
  apiHost: string;
}) {
  const tone =
    envLabel === "PRODUCTION" ? "healthy" : envLabel === "STAGING" ? "review" : "neutral";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Environment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Connected to</span>
          <Badge variant={tone}>{envLabel}</Badge>
        </div>
        <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-3 text-xs">
          <dt className="font-medium uppercase tracking-wider text-muted-foreground">
            API host
          </dt>
          <dd className="font-mono break-all">{apiHost}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
