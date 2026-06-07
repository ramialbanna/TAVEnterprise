import { listOpportunitiesPage } from "@/lib/app-api/server";

import { DashboardInterfaceClient } from "./_components/dashboard-interface-client";

/**
 * `/dashboard` — Home tiles with queue counts.
 */
export default async function DashboardPage() {
  const [needsAction, mine] = await Promise.all([
    listOpportunitiesPage({ limit: 1, offset: 0, sort: "spread_desc", view: "needs_action" }),
    listOpportunitiesPage({ limit: 1, offset: 0, sort: "spread_desc", view: "mine" }),
  ]);

  const homeCounts = {
    needsYou: needsAction.ok ? needsAction.data.total : undefined,
    mine: mine.ok ? mine.data.total : undefined,
  };

  return <DashboardInterfaceClient homeCounts={homeCounts} />;
}
