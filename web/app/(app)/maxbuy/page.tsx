import { MaxBuyCard } from "@/components/maxbuy/maxbuy-card";

/**
 * `/maxbuy` — standalone lane lookup (Phase 4 stub → Phase 6 live evaluate).
 */
export default function MaxBuyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Max buy lookup</h1>
        <p className="text-sm text-muted-foreground">
          Enter a VIN to see TAV segment history, expected costs, and a recommended max buy. Use
          this at the lane when you are not working a specific queue listing.
        </p>
      </header>
      <MaxBuyCard mode="disabled" variant="standalone" />
    </div>
  );
}
