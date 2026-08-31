import { DashboardInterfaceClient } from "./_components/dashboard-interface-client";

/**
 * `/dashboard` — Home tiles with queue counts.
 *
 * Item 58: counts load on the client (shared React Query cache). Awaiting
 * Worker SQL here blocked the Home ↔ Opportunities switch.
 */
export default function DashboardPage() {
  return <DashboardInterfaceClient />;
}
