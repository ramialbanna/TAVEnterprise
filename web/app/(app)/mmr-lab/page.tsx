import { MmrLabClient } from "./_components/mmr-lab-client";

/**
 * `/mmr-lab` — VIN ➜ Cox MMR lookup workspace.
 *
 * Server component shell. Mounts the client-side lookup + result surface. The previous
 * Cox-sandbox `CaveatBanner` was removed when Cox production MMR credentials went live
 * (2026-05-13); see ADR / followups for the cutover note. No machine-readable Cox
 * environment flag is exposed by `/app/system-status` yet — the page renders the same
 * way regardless of vendor environment.
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

      <MmrLabClient />
    </div>
  );
}
