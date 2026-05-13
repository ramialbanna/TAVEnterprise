import { auth } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { getSystemStatus } from "@/lib/app-api/server";

import { EnvSection } from "./_components/env-section";
import { AdminClient } from "./_components/admin-client";

/**
 * `/admin` — Phase 5 RSC shell.
 *
 * Fetches the authenticated session (the route is already gated by the auth proxy) plus
 * the first-paint `/app/system-status` `ApiResult`. Passes the signed-in email/name, the
 * `ENV_LABEL` from `serverEnv()`, the `APP_API_BASE_URL` host only (never the secret),
 * and the system-status result down to the client wrapper. Live polling + refresh live
 * in `<AdminClient />`; the env / signed-in panels are static RSC output.
 */
export default async function AdminPage() {
  const env = serverEnv();
  const [session, systemStatus] = await Promise.all([auth(), getSystemStatus()]);

  const apiHost = (() => {
    try {
      return new URL(env.APP_API_BASE_URL).host;
    } catch {
      return "unknown";
    }
  })();

  const email = session?.user?.email ?? null;
  const name = session?.user?.name ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Admin / Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Live operational status of the TAV API, intelligence worker, and ingestion sources.
        </p>
      </header>

      <section aria-label="Signed-in user" className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Signed in as
        </p>
        <p className="mt-1 text-sm font-medium">{name ?? "Unknown"}</p>
        <p className="text-xs text-muted-foreground">{email ?? "no email on session"}</p>
      </section>

      <EnvSection envLabel={env.ENV_LABEL} apiHost={apiHost} />

      <AdminClient initial={systemStatus} />
    </div>
  );
}
