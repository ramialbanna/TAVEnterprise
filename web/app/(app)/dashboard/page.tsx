import {
  getKpis,
  getSystemStatus,
  listHistoricalSales,
  listOpportunitiesPage,
} from "@/lib/app-api/server";

import { DashboardInterfaceClient } from "./_components/dashboard-interface-client";

/**
 * `/dashboard` — Classic shows KPI dashboard; New mode shows Home tiles (Phase 6).
 */
export default async function DashboardPage() {
  const [systemStatus, kpis, historicalSales, needsAction, mine] = await Promise.all([
    getSystemStatus(),
    getKpis(),
    listHistoricalSales({ limit: 100 }),
    listOpportunitiesPage({ limit: 1, offset: 0, sort: "spread_desc", view: "needs_action" }),
    listOpportunitiesPage({ limit: 1, offset: 0, sort: "spread_desc", view: "mine" }),
  ]);

  const homeCounts = {
    needsYou: needsAction.ok ? needsAction.data.total : undefined,
    mine: mine.ok ? mine.data.total : undefined,
  };

  return (
    <DashboardInterfaceClient
      systemStatus={systemStatus}
      kpis={kpis}
      historicalSales={historicalSales}
      homeCounts={homeCounts}
    />
  );
}
