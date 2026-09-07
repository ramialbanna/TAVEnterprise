import { NewModeOpsGuard } from "@/components/app-shell/new-mode-ops-guard";

import { BlockedSellersClient } from "./_components/blocked-sellers-client";

/**
 * `/admin/blocked-sellers` — review auto and buyer dealer blocks with
 * Facebook profile + listing links.
 */
export default function BlockedSellersPage() {
  return (
    <NewModeOpsGuard>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Blocked sellers</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Hidden from Opportunities. Sort and filter, open the Facebook profile, then keep
            real dealers or remove private sellers.
          </p>
        </header>
        <BlockedSellersClient />
      </div>
    </NewModeOpsGuard>
  );
}
