import { MaxbuyLiveCard } from "@/components/maxbuy/maxbuy-live-card";

/**
 * `/maxbuy` — standalone lane lookup (VIN or Year/Make/Model).
 */
export default function MaxBuyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Max buy lookup</h1>
        <p className="text-sm text-muted-foreground">
          Enter a VIN — or Year, Make, and Model — to see TAV segment history, expected costs,
          and a recommended max buy. Use this at the lane when you are not working a specific
          queue listing.
        </p>
      </header>
      <MaxbuyLiveCard
        variant="standalone"
        showRegion
        initialValues={{ vin: "", year: "", make: "", model: "", trim: "", mileage: "", askingPrice: "", region: "" }}
      />
    </div>
  );
}
