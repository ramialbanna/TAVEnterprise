import { NewModeOpsGuard } from "@/components/app-shell/new-mode-ops-guard";

import { MmrLabClient } from "./_components/mmr-lab-client";

/**
 * `/mmr-lab` — Manheim-style MMR workspace.
 *
 * Server component shell. VIN lookup goes browser → /api/app/mmr/vin → Worker
 * (unchanged). Year/Make/Model/Style is disabled ("live catalog not
 * connected") until official Manheim/Cox metadata + YMM valuation are
 * provisioned (issue #45). No hardcoded catalog, no scraping, no dummy data.
 */
export default function MmrLabPage() {
  return (
    <NewModeOpsGuard>
      <MmrLabClient />
    </NewModeOpsGuard>
  );
}
