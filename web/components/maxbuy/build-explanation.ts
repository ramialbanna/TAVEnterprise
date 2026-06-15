import type { MaxBuyCardSnapshot } from "./types";

export type MaxbuyExplanationInput = {
  snapshot: Pick<
    MaxBuyCardSnapshot,
    | "recommendedMaxBuy"
    | "displayState"
    | "verdict"
    | "dataStrength"
    | "reasonCodes"
    | "deltaToAsk"
    | "askingPrice"
    | "mmrWholesale"
  >;
  economics: {
    expectedSalePrice: number;
    expectedTransport: number;
    expectedExpenses: number;
  };
  tavHistorical: {
    nUnits: number;
  };
};

export type MaxbuyExplanationMath = {
  expectedSale: number;
  transport: number;
  expenses: number;
  targetNet: number;
  maxBuy: number;
};

export type MaxbuyExplanation = {
  narrative: string | null;
  math: MaxbuyExplanationMath | null;
  cautionLine: string | null;
};

const HARD_GATE_NARRATIVES: Record<string, string> = {
  GATE_TITLE_BRAND: "Title brand on file — we can't recommend bidding on this vehicle.",
  GATE_SALVAGE: "Salvage history on file — we can't recommend bidding on this vehicle.",
  GATE_FLOOD: "Flood damage on file — we can't recommend bidding on this vehicle.",
  GATE_FRAME_STRUCTURAL:
    "Frame or structural damage on file — we can't recommend bidding on this vehicle.",
  GATE_ODOMETER: "Odometer discrepancy on file — we can't recommend bidding on this vehicle.",
  GATE_RECALL_STOPSALE:
    "Open stop-sale recall on file — resolve before bidding on this vehicle.",
  GATE_ARBITRATION: "Arbitration risk flagged — we can't recommend bidding on this vehicle.",
  GATE_SOURCE_RESTRICTED:
    "Source restriction on file — we can't recommend bidding on this vehicle.",
  GATE_MMR_MISSING:
    "We don't have a wholesale MMR anchor for this vehicle, so treat this max buy as a rough guide only.",
};

const REASON_CODE_LABELS: Record<string, string> = {
  ymm_primary_no_vin: "YMM-only lookup — no VIN history on this run",
  ymm_fallback: "MMR fell back to year/make/model (VIN match unavailable)",
  segment_clears_against_mmr: "Expected sale clears against wholesale MMR",
  GATE_MMR_MISSING: "Wholesale MMR anchor missing",
};

const BENCHMARK_FALLBACK_LABELS: Record<string, string> = {
  ymm: "Benchmark used year/make/model segment (not exact trim)",
  mm: "Benchmark used make/model segment (not exact year/trim)",
  global: "Benchmark used global fallback (limited segment data)",
};

function hardGateFromCodes(codes: string[]): string | null {
  return codes.find((code) => code.startsWith("GATE_") && code !== "GATE_MMR_MISSING") ?? null;
}

function deriveTargetNetGross(input: MaxbuyExplanationInput): number | null {
  const { economics, snapshot } = input;
  const maxBuy = snapshot.recommendedMaxBuy;
  if (maxBuy === null || economics.expectedSalePrice <= 0) return null;
  return (
    economics.expectedSalePrice -
    economics.expectedTransport -
    economics.expectedExpenses -
    maxBuy
  );
}

function buildSegmentNarrative(input: MaxbuyExplanationInput): string | null {
  const { economics, tavHistorical } = input;
  const sale = economics.expectedSalePrice;
  if (sale <= 0) return null;

  if (tavHistorical.nUnits > 0) {
    const units = tavHistorical.nUnits.toLocaleString();
    return `Based on ${units} similar TAV outcomes in this segment, we expect to sell around $${sale.toLocaleString()}.`;
  }

  if (input.snapshot.mmrWholesale !== null && input.snapshot.mmrWholesale > 0) {
    return `Limited TAV segment history — we lean on wholesale MMR and benchmarks and expect to sell around $${sale.toLocaleString()}.`;
  }

  return `Without enough segment history, we expect to sell around $${sale.toLocaleString()}.`;
}

function buildDealFitSuffix(input: MaxbuyExplanationInput): string | null {
  const { snapshot } = input;
  if (snapshot.displayState !== "deal_fit" || snapshot.verdict !== "pass") return null;
  if (hardGateFromCodes(snapshot.reasonCodes)) return null;
  if (snapshot.reasonCodes.includes("GATE_MMR_MISSING")) return null;
  if (snapshot.deltaToAsk !== null && snapshot.deltaToAsk < 0) {
    return "The lane ask is above our recommended max — we'd pass at the current price.";
  }
  return null;
}

function buildVehicleFitSuffix(): string {
  return "Enter a lane ask above to compare your offer against this vehicle ceiling.";
}

/** Turn evaluate display fields into buyer-facing narrative, math chain, and caution copy. */
export function buildMaxbuyExplanation(input: MaxbuyExplanationInput): MaxbuyExplanation {
  const hardGate = hardGateFromCodes(input.snapshot.reasonCodes);
  const mmrGate = input.snapshot.reasonCodes.includes("GATE_MMR_MISSING");

  let narrative: string | null = null;
  if (hardGate && HARD_GATE_NARRATIVES[hardGate]) {
    narrative = HARD_GATE_NARRATIVES[hardGate];
  } else if (mmrGate) {
    narrative = HARD_GATE_NARRATIVES.GATE_MMR_MISSING ?? null;
  } else {
    narrative = buildSegmentNarrative(input);
    const suffix =
      input.snapshot.displayState === "vehicle_fit"
        ? buildVehicleFitSuffix()
        : buildDealFitSuffix(input);
    if (narrative && suffix) {
      narrative = `${narrative} ${suffix}`;
    } else if (!narrative && suffix) {
      narrative = suffix;
    }
  }

  const maxBuy = input.snapshot.recommendedMaxBuy;
  const targetNet = deriveTargetNetGross(input);
  const math: MaxbuyExplanationMath | null =
    maxBuy !== null &&
    targetNet !== null &&
    input.economics.expectedSalePrice > 0
      ? {
          expectedSale: input.economics.expectedSalePrice,
          transport: input.economics.expectedTransport,
          expenses: input.economics.expectedExpenses,
          targetNet,
          maxBuy,
        }
      : null;

  const cautionLine =
    input.snapshot.dataStrength === "low"
      ? "Limited segment data — treat this as a rough guide."
      : null;

  return { narrative, math, cautionLine };
}

/** Human label for a raw MaxBuy reason code (Details / ops view). */
export function labelMaxbuyReasonCode(code: string): string {
  if (REASON_CODE_LABELS[code]) return REASON_CODE_LABELS[code];

  const benchmarkMatch = /^benchmark_(.+)_fallback$/.exec(code);
  if (benchmarkMatch) {
    const resolution = benchmarkMatch[1] ?? "unknown";
    return BENCHMARK_FALLBACK_LABELS[resolution] ?? `Benchmark fallback (${resolution})`;
  }

  if (code.startsWith("GATE_")) {
    return (
      HARD_GATE_NARRATIVES[code]?.replace(/ —.*$/, "") ??
      code.replaceAll("_", " ").toLowerCase()
    );
  }

  return code.replaceAll("_", " ");
}
