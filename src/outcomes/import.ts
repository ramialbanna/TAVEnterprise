// Row parser for purchase outcome CSV imports.
// Pure validation + normalization — no I/O.

import { normalizeConditionGrade } from "./conditionGrade";
import { computeImportFingerprint } from "./fingerprint";
import type { ConditionGradeNormalized } from "./conditionGrade";

export interface ParsedOutcomeRow {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  mileage?: number;
  pricePaid: number;
  salePrice?: number;
  grossProfit?: number;
  holdDays?: number;
  conditionGradeRaw?: string;
  conditionGradeNormalized: ConditionGradeNormalized;
  purchaseChannel?: "auction" | "private" | "dealer";
  sellingChannel?: "retail" | "wholesale" | "auction";
  transportCost?: number;
  auctionFee?: number;
  miscOverhead?: number;
  weekLabel?: string;
  buyerId?: string;
  closerId?: string;
  region?: string;
  cotCity?: string;
  cotState?: string;
  source?: string;
  importFingerprint: string;
}

export type ParseOutcomeResult =
  | { ok: true; data: ParsedOutcomeRow }
  | { ok: false; reasonCode: string; field?: string };

const PURCHASE_CHANNELS = new Set(["auction", "private", "dealer"]);
const SELLING_CHANNELS = new Set(["retail", "wholesale", "auction"]);

function getString(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = row[key];
    if (typeof val === "string" && val.trim() !== "") return val.trim();
  }
  return undefined;
}

function getNumber(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const val = row[key];
    if (typeof val === "number" && isFinite(val)) return val;
    if (typeof val === "string") {
      const parsed = Number(val);
      if (!isNaN(parsed) && isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export async function parseOutcomeRow(rawRow: unknown): Promise<ParseOutcomeResult> {
  // Guard: must be a non-null object
  if (typeof rawRow !== "object" || rawRow === null || Array.isArray(rawRow)) {
    return { ok: false, reasonCode: "invalid_row_type" };
  }

  const row = rawRow as Record<string, unknown>;

  // Validate price_paid (required, positive integer)
  const rawPricePaid = getNumber(row, "price_paid", "pricePaid");
  if (rawPricePaid === undefined) {
    return { ok: false, reasonCode: "missing_price_paid", field: "price_paid" };
  }
  if (!Number.isInteger(rawPricePaid) || rawPricePaid <= 0) {
    return { ok: false, reasonCode: "invalid_price_paid", field: "price_paid" };
  }

  // Resolve vehicle identity: VIN or full YMM+mileage
  const vin = getString(row, "vin");
  const year = getNumber(row, "year");
  const make = getString(row, "make");
  const model = getString(row, "model");
  const mileage = getNumber(row, "mileage");

  const hasVin = vin !== undefined;
  const hasYmm = year !== undefined && make !== undefined && model !== undefined && mileage !== undefined;

  if (!hasVin && !hasYmm) {
    return { ok: false, reasonCode: "missing_vehicle_identity" };
  }

  // Validate purchaseChannel if present
  const purchaseChannelRaw = getString(row, "purchase_channel", "purchaseChannel");
  if (purchaseChannelRaw !== undefined && !PURCHASE_CHANNELS.has(purchaseChannelRaw.toLowerCase())) {
    return { ok: false, reasonCode: "invalid_purchase_channel", field: "purchase_channel" };
  }

  // Validate sellingChannel if present
  const sellingChannelRaw = getString(row, "selling_channel", "sellingChannel");
  if (sellingChannelRaw !== undefined && !SELLING_CHANNELS.has(sellingChannelRaw.toLowerCase())) {
    return { ok: false, reasonCode: "invalid_selling_channel", field: "selling_channel" };
  }

  // Resolve optional fields
  const conditionGradeRaw = getString(row, "condition_grade_raw", "conditionGradeRaw");
  const weekLabel = getString(row, "week_label", "weekLabel");
  const buyerId = getString(row, "buyer_id", "buyerId");
  const closerId = getString(row, "closer", "closer_id", "closerId");
  const cotCity = getString(row, "cot_city", "COT City", "cotCity");
  const cotState = getString(row, "cot_state", "COT State", "cotState");
  const region = getString(row, "region");
  const source = getString(row, "source");
  const salePrice = getNumber(row, "sale_price", "salePrice");
  const grossProfit = getNumber(row, "gross_profit", "grossProfit");
  const holdDays = getNumber(row, "hold_days", "holdDays");
  const transportCost = getNumber(row, "transport_cost", "transportCost");
  const auctionFee = getNumber(row, "auction_fee", "auctionFee");
  const miscOverhead = getNumber(row, "misc_overhead", "miscOverhead");

  // Build fingerprint vehicle key: VIN or YMM+mileage-bucket composite
  const vehicleKey = hasVin
    ? (vin as string)
    : `${year!}:${make!}:${model!}:${Math.floor((mileage ?? 0) / 10000) * 10000}`;

  const fingerprintWeekLabel = weekLabel ?? "unknown";
  const fingerprintBuyerId = buyerId ?? "anonymous";

  const importFingerprint = await computeImportFingerprint(
    fingerprintWeekLabel,
    vehicleKey,
    fingerprintBuyerId,
  );

  const data: ParsedOutcomeRow = {
    pricePaid: rawPricePaid,
    conditionGradeNormalized: normalizeConditionGrade(conditionGradeRaw),
    importFingerprint,
  };

  // Attach optional identity fields only when present
  if (hasVin) data.vin = vin;
  if (year !== undefined) data.year = year;
  if (make !== undefined) data.make = make;
  if (model !== undefined) data.model = model;
  if (mileage !== undefined) data.mileage = mileage;

  if (salePrice !== undefined) data.salePrice = salePrice;
  if (grossProfit !== undefined) data.grossProfit = grossProfit;
  if (holdDays !== undefined) data.holdDays = holdDays;
  if (conditionGradeRaw !== undefined) data.conditionGradeRaw = conditionGradeRaw;

  if (purchaseChannelRaw !== undefined) {
    data.purchaseChannel = purchaseChannelRaw.toLowerCase() as "auction" | "private" | "dealer";
  }
  if (sellingChannelRaw !== undefined) {
    data.sellingChannel = sellingChannelRaw.toLowerCase() as "retail" | "wholesale" | "auction";
  }

  if (transportCost !== undefined) data.transportCost = transportCost;
  if (auctionFee !== undefined) data.auctionFee = auctionFee;
  if (miscOverhead !== undefined) data.miscOverhead = miscOverhead;
  if (weekLabel !== undefined) data.weekLabel = weekLabel;
  if (buyerId !== undefined) data.buyerId = buyerId;
  if (closerId !== undefined) data.closerId = closerId;
  if (region !== undefined) data.region = region;
  if (cotCity !== undefined) data.cotCity = cotCity;
  if (cotState !== undefined) data.cotState = cotState;
  if (source !== undefined) data.source = source;

  return { ok: true, data };
}
