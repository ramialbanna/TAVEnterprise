import { CaveatBanner } from "@/components/status";

import { MmrLabClient } from "./_components/mmr-lab-client";

/**
 * `/mmr-lab` — VIN ➜ Cox MMR lookup workspace.
 *
 * Server component shell. Renders the persistent Cox-sandbox `CaveatBanner` (always
 * visible until Cox enables true production credentials) and mounts the client-side
 * lookup + result surface.
 */
export default function MmrLabPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">VIN / MMR Lab</h1>
        <p className="text-sm text-muted-foreground">
          Look up a vehicle&apos;s Cox MMR value and a heuristic acquisition recommendation
          from the spread against an asking price.
        </p>
      </header>

      <CaveatBanner tone="caution" title="Cox sandbox — not production">
        Cox MMR is currently sandbox-backed in production until Cox enables true
        production MMR credentials.
      </CaveatBanner>

      <MmrLabClient />
    </div>
  );
}
