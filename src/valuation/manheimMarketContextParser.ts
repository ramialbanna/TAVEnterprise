/**
 * Pure extractor for Cox/Manheim MMR market-context fields beyond distribution tiers.
 *
 * Requires `include=historical,forecast` on the Cox request (MANHEIM_INCLUDE_* flags).
 * Transaction rows are parsed when present on the payload; the standard Valuations API
 * often omits per-sale arrays — callers treat an empty `transactions` list as valid.
 */

export interface MmrHistoricalSlot {
  price: number | null;
  avgMileage: number | null;
}

export interface MmrHistoricalAverages {
  past30Days: MmrHistoricalSlot | null;
  sixMonthsAgo: MmrHistoricalSlot | null;
  lastYear: MmrHistoricalSlot | null;
}

export interface MmrProjectedAverage {
  price: number | null;
  avgMileage: number | null;
}

export interface MmrTransaction {
  date: string | null;
  price: number | null;
  odometer: number | null;
  grade: string | null;
  evbh: number | null;
  engineTrans: string | null;
  exteriorColor: string | null;
  type: string | null;
  region: string | null;
  auction: string | null;
}

export interface ManheimMarketContext {
  historicalAverages: MmrHistoricalAverages | null;
  projectedAverage: MmrProjectedAverage | null;
  transactions: MmrTransaction[];
}

const EMPTY_CONTEXT: ManheimMarketContext = {
  historicalAverages: null,
  projectedAverage: null,
  transactions: [],
};

const HISTORICAL_PERIOD_KEYS = {
  past30Days: ["last30Days", "last30days", "last30Days"],
  sixMonthsAgo: ["lastSixMonths", "lastsixmonths", "sixMonthsAgo"],
  lastYear: ["lastYear", "lastyear"],
} as const;

const TRANSACTION_ARRAY_KEYS = [
  "transactions",
  "auctionTransactions",
  "recentTransactions",
  "sampleTransactions",
  "auctionSales",
  "sales",
  "samples",
] as const;

export function extractManheimMarketContext(payload: unknown): ManheimMarketContext {
  const item = firstPayloadItem(payload);
  if (!item) return EMPTY_CONTEXT;

  const historicalAverages = parseHistoricalAverages(item.historicalAverages);
  const projectedAverage = parseProjectedAverage(item.forecast);
  const transactions = parseTransactions(item);

  if (historicalAverages === null && projectedAverage === null && transactions.length === 0) {
    return EMPTY_CONTEXT;
  }

  return { historicalAverages, projectedAverage, transactions };
}

function firstPayloadItem(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const candidate =
    Array.isArray(root.items) && root.items.length > 0 ? root.items[0] : root;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
}

function parseHistoricalAverages(raw: unknown): MmrHistoricalAverages | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const past30Days = readHistoricalSlot(record, HISTORICAL_PERIOD_KEYS.past30Days);
  const sixMonthsAgo = readHistoricalSlot(record, HISTORICAL_PERIOD_KEYS.sixMonthsAgo);
  const lastYear = readHistoricalSlot(record, HISTORICAL_PERIOD_KEYS.lastYear);

  if (!past30Days && !sixMonthsAgo && !lastYear) return null;
  return { past30Days, sixMonthsAgo, lastYear };
}

function readHistoricalSlot(
  record: Record<string, unknown>,
  keys: readonly string[],
): MmrHistoricalSlot | null {
  const slot = readNestedObject(record, keys);
  if (!slot) return null;
  const price = readPositiveInt(slot.price ?? slot.average ?? slot.wholesale);
  const avgMileage = readPositiveInt(slot.odometer ?? slot.averageOdometer ?? slot.avgOdometer);
  if (price === null && avgMileage === null) return null;
  return { price, avgMileage };
}

function parseProjectedAverage(raw: unknown): MmrProjectedAverage | null {
  if (!raw || typeof raw !== "object") return null;
  const forecast = raw as Record<string, unknown>;
  const nextMonth = readNestedObject(forecast, ["nextMonth", "nextmonth"]);
  if (!nextMonth) return null;

  const price = readPositiveInt(
    nextMonth.wholesale ?? nextMonth.average ?? nextMonth.price,
  );
  const avgMileage = readPositiveInt(
    nextMonth.odometer ?? nextMonth.averageOdometer ?? nextMonth.avgOdometer,
  );
  if (price === null && avgMileage === null) return null;
  return { price, avgMileage };
}

function parseTransactions(item: Record<string, unknown>): MmrTransaction[] {
  for (const key of TRANSACTION_ARRAY_KEYS) {
    const raw = item[key];
    if (!Array.isArray(raw) || raw.length === 0) continue;
    const mapped = raw
      .map((row) => mapTransactionRow(row))
      .filter((row): row is MmrTransaction => row !== null);
    if (mapped.length > 0) return mapped;
  }
  return [];
}

function mapTransactionRow(raw: unknown): MmrTransaction | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const price = readPositiveInt(
    row.price ?? row.salePrice ?? row.wholesale ?? row.amount ?? row.average,
  );
  const odometer = readPositiveInt(row.odometer ?? row.odo ?? row.mileage);
  const date = readString(row.date ?? row.saleDate ?? row.transactionDate ?? row.auctionDate);
  const grade = formatGrade(row.grade ?? row.conditionGrade ?? row.averageGrade);
  const evbh = readPositiveInt(row.evbh ?? row.EVBH ?? row.averageEVBH);
  const engineTrans = readString(
    row.engineTrans ?? row.engineTransmission ?? row.engine ?? row.transmission,
  );
  const exteriorColor = readString(row.exteriorColor ?? row.color ?? row.extColor);
  const type = readString(row.type ?? row.saleType ?? row.transactionType);
  const region = readString(row.region ?? row.saleRegion);
  const auction = readString(row.auction ?? row.auctionName ?? row.location);

  const hasData =
    price !== null ||
    odometer !== null ||
    date !== null ||
    grade !== null ||
    evbh !== null ||
    engineTrans !== null ||
    exteriorColor !== null ||
    type !== null ||
    region !== null ||
    auction !== null;

  if (!hasData) return null;

  return {
    date,
    price,
    odometer,
    grade,
    evbh,
    engineTrans,
    exteriorColor,
    type,
    region,
    auction,
  };
}

function readNestedObject(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function readPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Cox grades are often integers (42 → 4.2). */
function formatGrade(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 10) return (value / 10).toFixed(1);
    return String(value);
  }
  return null;
}
