import { Check, KeyRound } from "lucide-react";

import type { SystemStatus } from "@/lib/app-api/schemas";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SecretStatus = "confirmed" | "inferred" | "managed";

type SecretEntry = {
  name: string;
  status: SecretStatus;
};

const NOT_VISIBLE_LABEL =
  "managed as Cloudflare Worker secrets — not visible here";

/**
 * Read-only checklist of backend secret NAMES — never values. APP_API_SECRET is
 * "confirmed configured" because the page itself only renders if /app/* answered.
 * Intel-worker secret is "inferred" from `intelWorker.mode`/`binding`. Everything else
 * is "managed as Cloudflare Worker secrets — not visible here".
 *
 * The component asserts (by construction) that no secret VALUE ever reaches the DOM —
 * it has no props that could carry a value. `secrets-checklist.test.tsx` enforces this
 * with a regex sweep over the rendered text.
 */
export function SecretsChecklist({ intelWorker }: { intelWorker: SystemStatus["intelWorker"] }) {
  const intelConfigured =
    intelWorker.mode === "worker" && (intelWorker.binding || intelWorker.url !== null);

  const entries: SecretEntry[] = [
    { name: "APP_API_SECRET", status: "confirmed" },
    { name: "ADMIN_API_SECRET", status: "managed" },
    { name: "WEBHOOK_HMAC_SECRET", status: "managed" },
    { name: "INTEL_WORKER_SECRET", status: intelConfigured ? "inferred" : "managed" },
    { name: "MANHEIM_CLIENT_ID", status: "managed" },
    { name: "MANHEIM_CLIENT_SECRET", status: "managed" },
    { name: "TWILIO_ACCOUNT_SID", status: "managed" },
    { name: "TWILIO_AUTH_TOKEN", status: "managed" },
    { name: "TWILIO_FROM_NUMBER", status: "managed" },
    { name: "SUPABASE_SERVICE_ROLE_KEY", status: "managed" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Secrets checklist</CardTitle>
        <CardDescription>Secret names only — values are {NOT_VISIBLE_LABEL}.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {entries.map((entry) => (
            <li key={entry.name} className="flex flex-wrap items-center gap-2">
              <KeyRound className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="font-mono text-xs">{entry.name}</span>
              <SecretStatusBadge status={entry.status} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SecretStatusBadge({ status }: { status: SecretStatus }) {
  if (status === "confirmed") {
    return (
      <Badge variant="healthy" className="gap-1">
        <Check className="size-3" aria-hidden />
        confirmed configured
      </Badge>
    );
  }
  if (status === "inferred") {
    return <Badge variant="healthy">inferred from system-status</Badge>;
  }
  return <Badge variant="neutral">{NOT_VISIBLE_LABEL}</Badge>;
}
