import { MmrLabClient } from "./_components/mmr-lab-client";

/**
 * `/mmr-lab` — Combined MMR + MaxBuy valuation workspace (buyer-accessible).
 *
 * Server component shell. VIN lookup goes browser → /api/app/mmr/vin → Worker.
 * Y/M/M/S uses live Manheim/Cox catalog when connected.
 */
export default function MmrLabPage() {
  return <MmrLabClient />;
}
