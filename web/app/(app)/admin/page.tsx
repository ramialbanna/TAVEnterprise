import { NewModeOpsGuard } from "@/components/app-shell/new-mode-ops-guard";
import { auth } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

import { EnvSection } from "./_components/env-section";
import { AdminClient } from "./_components/admin-client";

/**
 * `/admin` — Phase 5 RSC shell.
 *
 * Session + env label are local (no Worker). System status loads on the client
 * so sidebar switches are not blocked on `/app/system-status`.
 */
export default async function AdminPage() {
  const env = serverEnv();
  const session = await auth();

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
    <NewModeOpsGuard>
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

      <AdminClient />
    </div>
    </NewModeOpsGuard>
  );
}
