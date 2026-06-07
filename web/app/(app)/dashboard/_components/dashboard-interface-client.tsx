"use client";

import { DashboardHomeNew } from "./dashboard-home-new";

export function DashboardInterfaceClient({
  homeCounts,
}: {
  homeCounts: { needsYou?: number; mine?: number };
}) {
  return <DashboardHomeNew initialCounts={homeCounts} />;
}
