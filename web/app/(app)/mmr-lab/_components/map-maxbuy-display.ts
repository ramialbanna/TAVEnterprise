import { mapMaxbuyEvaluateToSnapshot } from "@/components/maxbuy/map-snapshot";
import type { MaxbuyEvaluateOk } from "@/lib/app-api/schemas";

import type { MaxbuyEvaluationDisplay } from "./maxbuy-evaluation-section";

/** Map live evaluate API payload to Zone C1 display model (P2.6). */
export function mapMaxbuyEvaluateToDisplay(
  data: MaxbuyEvaluateOk,
  askingPrice: number | null,
): MaxbuyEvaluationDisplay {
  return {
    snapshot: mapMaxbuyEvaluateToSnapshot(data, askingPrice),
    economics: {
      expectedSalePrice: data.economics.expected_sale_price,
      expectedTransport: data.economics.expected_transport,
      expectedExpenses: data.economics.expected_expenses,
      expectedNetGross: data.economics.expected_net_gross,
    },
    tavHistorical: {
      nUnits: data.tav_historical.n_units,
      avgBuy: data.tav_historical.avg_buy,
      avgSale: data.tav_historical.avg_sale,
      avgGross: data.tav_historical.avg_gross,
      avgDaysToSale: data.tav_historical.avg_days_to_sale,
    },
  };
}
