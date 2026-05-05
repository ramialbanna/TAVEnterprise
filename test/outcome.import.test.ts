import { describe, it, expect } from "vitest";
import { normalizeConditionGrade } from "../src/outcomes/conditionGrade";
import { computeImportFingerprint } from "../src/outcomes/fingerprint";
import { parseOutcomeRow } from "../src/outcomes/import";

// ── conditionGrade ────────────────────────────────────────────────────────────

describe("normalizeConditionGrade", () => {
  it("maps 'Excellent' to 'excellent' (case-insensitive)", () => {
    expect(normalizeConditionGrade("Excellent")).toBe("excellent");
  });

  it("maps 'rough' to 'poor'", () => {
    expect(normalizeConditionGrade("rough")).toBe("poor");
  });

  it("maps 'Good' to 'good' (case-insensitive)", () => {
    expect(normalizeConditionGrade("Good")).toBe("good");
  });

  it("maps 'FAIR' to 'fair' (case-insensitive)", () => {
    expect(normalizeConditionGrade("FAIR")).toBe("fair");
  });

  it("maps 'salvage' to 'poor'", () => {
    expect(normalizeConditionGrade("salvage")).toBe("poor");
  });

  it("returns 'unknown' for null", () => {
    expect(normalizeConditionGrade(null)).toBe("unknown");
  });

  it("returns 'unknown' for undefined", () => {
    expect(normalizeConditionGrade(undefined)).toBe("unknown");
  });

  it("returns 'unknown' for unrecognized string", () => {
    expect(normalizeConditionGrade("mint")).toBe("unknown");
  });

  it("returns 'unknown' for empty string", () => {
    expect(normalizeConditionGrade("  ")).toBe("unknown");
  });
});

// ── fingerprint ───────────────────────────────────────────────────────────────

describe("computeImportFingerprint", () => {
  it("is deterministic — same input produces same fingerprint", async () => {
    const a = await computeImportFingerprint("2024-W01", "1HGCM82633A004352", "buyer-1");
    const b = await computeImportFingerprint("2024-W01", "1HGCM82633A004352", "buyer-1");
    expect(a).toBe(b);
  });

  it("produces a 64-char hex string", async () => {
    const fp = await computeImportFingerprint("2024-W01", "1HGCM82633A004352", "buyer-1");
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when VIN changes", async () => {
    const a = await computeImportFingerprint("2024-W01", "1HGCM82633A004352", "buyer-1");
    const b = await computeImportFingerprint("2024-W01", "1HGCM82633A004999", "buyer-1");
    expect(a).not.toBe(b);
  });

  it("differs when weekLabel changes", async () => {
    const a = await computeImportFingerprint("2024-W01", "1HGCM82633A004352", "buyer-1");
    const b = await computeImportFingerprint("2024-W02", "1HGCM82633A004352", "buyer-1");
    expect(a).not.toBe(b);
  });

  it("differs when buyerId changes", async () => {
    const a = await computeImportFingerprint("2024-W01", "1HGCM82633A004352", "buyer-1");
    const b = await computeImportFingerprint("2024-W01", "1HGCM82633A004352", "buyer-2");
    expect(a).not.toBe(b);
  });

  it("is case-insensitive for VIN — lower and upper produce same fingerprint", async () => {
    const a = await computeImportFingerprint("2024-W01", "1hgcm82633a004352", "buyer-1");
    const b = await computeImportFingerprint("2024-W01", "1HGCM82633A004352", "buyer-1");
    expect(a).toBe(b);
  });
});

// ── parseOutcomeRow ───────────────────────────────────────────────────────────

describe("parseOutcomeRow", () => {
  // ── Happy paths ──────────────────────────────────────────────────────────

  it("valid row with VIN returns ok:true with correct fields mapped", async () => {
    const result = await parseOutcomeRow({
      vin: "1HGCM82633A004352",
      price_paid: 14000,
      sale_price: 16500,
      gross_profit: 2500,
      hold_days: 12,
      condition_grade_raw: "Good",
      purchase_channel: "auction",
      selling_channel: "retail",
      transport_cost: 350,
      auction_fee: 200,
      misc_overhead: 50,
      week_label: "2024-W03",
      buyer_id: "buyer-42",
      region: "dallas_tx",
      source: "manheim",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.vin).toBe("1HGCM82633A004352");
    expect(result.data.pricePaid).toBe(14000);
    expect(result.data.salePrice).toBe(16500);
    expect(result.data.grossProfit).toBe(2500);
    expect(result.data.holdDays).toBe(12);
    expect(result.data.conditionGradeRaw).toBe("Good");
    expect(result.data.conditionGradeNormalized).toBe("good");
    expect(result.data.purchaseChannel).toBe("auction");
    expect(result.data.sellingChannel).toBe("retail");
    expect(result.data.transportCost).toBe(350);
    expect(result.data.auctionFee).toBe(200);
    expect(result.data.miscOverhead).toBe(50);
    expect(result.data.weekLabel).toBe("2024-W03");
    expect(result.data.buyerId).toBe("buyer-42");
    expect(result.data.region).toBe("dallas_tx");
    expect(result.data.source).toBe("manheim");
    expect(result.data.importFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("valid row with YMM (no VIN) returns ok:true", async () => {
    const result = await parseOutcomeRow({
      year: 2020,
      make: "Toyota",
      model: "Camry",
      mileage: 55000,
      price_paid: 18000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.vin).toBeUndefined();
    expect(result.data.year).toBe(2020);
    expect(result.data.make).toBe("Toyota");
    expect(result.data.model).toBe("Camry");
    expect(result.data.mileage).toBe(55000);
    expect(result.data.pricePaid).toBe(18000);
    expect(result.data.conditionGradeNormalized).toBe("unknown");
    expect(result.data.importFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts camelCase field aliases (pricePaid, buyerId, etc.)", async () => {
    const result = await parseOutcomeRow({
      vin: "1HGCM82633A004352",
      pricePaid: 12000,
      buyerId: "buyer-10",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pricePaid).toBe(12000);
    expect(result.data.buyerId).toBe("buyer-10");
  });

  it("accepts price_paid as a numeric string", async () => {
    const result = await parseOutcomeRow({
      vin: "1HGCM82633A004352",
      price_paid: "15000",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pricePaid).toBe(15000);
  });

  // ── Rejection: price_paid ────────────────────────────────────────────────

  it("missing price_paid returns reasonCode: missing_price_paid", async () => {
    const result = await parseOutcomeRow({ vin: "1HGCM82633A004352" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("missing_price_paid");
  });

  it("price_paid = 0 returns reasonCode: invalid_price_paid", async () => {
    const result = await parseOutcomeRow({ vin: "1HGCM82633A004352", price_paid: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("invalid_price_paid");
  });

  it("price_paid = -500 returns reasonCode: invalid_price_paid", async () => {
    const result = await parseOutcomeRow({ vin: "1HGCM82633A004352", price_paid: -500 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("invalid_price_paid");
  });

  it("price_paid = 14000.50 (non-integer) returns reasonCode: invalid_price_paid", async () => {
    const result = await parseOutcomeRow({ vin: "1HGCM82633A004352", price_paid: 14000.50 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("invalid_price_paid");
  });

  // ── Rejection: vehicle identity ──────────────────────────────────────────

  it("no VIN and no YMM returns reasonCode: missing_vehicle_identity", async () => {
    const result = await parseOutcomeRow({ price_paid: 12000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("missing_vehicle_identity");
  });

  it("partial YMM (year + make, no model) returns reasonCode: missing_vehicle_identity", async () => {
    const result = await parseOutcomeRow({
      year: 2020,
      make: "Toyota",
      price_paid: 12000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("missing_vehicle_identity");
  });

  it("YMM missing mileage returns reasonCode: missing_vehicle_identity", async () => {
    const result = await parseOutcomeRow({
      year: 2020,
      make: "Toyota",
      model: "Camry",
      price_paid: 12000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("missing_vehicle_identity");
  });

  // ── Rejection: channel validation ────────────────────────────────────────

  it("invalid purchase_channel returns reasonCode: invalid_purchase_channel", async () => {
    const result = await parseOutcomeRow({
      vin: "1HGCM82633A004352",
      price_paid: 12000,
      purchase_channel: "trade-in",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("invalid_purchase_channel");
  });

  it("invalid selling_channel returns reasonCode: invalid_selling_channel", async () => {
    const result = await parseOutcomeRow({
      vin: "1HGCM82633A004352",
      price_paid: 12000,
      selling_channel: "craigslist",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("invalid_selling_channel");
  });

  it("valid purchase_channel 'private' is accepted", async () => {
    const result = await parseOutcomeRow({
      vin: "1HGCM82633A004352",
      price_paid: 12000,
      purchase_channel: "private",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.purchaseChannel).toBe("private");
  });

  // ── Condition grade normalization ─────────────────────────────────────────

  it("condition_grade_raw 'Good' normalizes to 'good'", async () => {
    const result = await parseOutcomeRow({
      vin: "1HGCM82633A004352",
      price_paid: 12000,
      condition_grade_raw: "Good",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conditionGradeNormalized).toBe("good");
  });

  it("absent condition grade normalizes to 'unknown'", async () => {
    const result = await parseOutcomeRow({
      vin: "1HGCM82633A004352",
      price_paid: 12000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.conditionGradeNormalized).toBe("unknown");
  });

  // ── Fingerprint determinism ───────────────────────────────────────────────

  it("fingerprint is deterministic — same input produces same fingerprint", async () => {
    const row = { vin: "1HGCM82633A004352", price_paid: 14000, week_label: "2024-W01", buyer_id: "b1" };
    const r1 = await parseOutcomeRow(row);
    const r2 = await parseOutcomeRow(row);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.data.importFingerprint).toBe(r2.data.importFingerprint);
  });

  it("fingerprint differs with different VIN", async () => {
    const r1 = await parseOutcomeRow({ vin: "1HGCM82633A004352", price_paid: 14000, week_label: "2024-W01", buyer_id: "b1" });
    const r2 = await parseOutcomeRow({ vin: "1HGCM82633A000001", price_paid: 14000, week_label: "2024-W01", buyer_id: "b1" });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.data.importFingerprint).not.toBe(r2.data.importFingerprint);
  });

  it("fingerprint uses mileage bucket for YMM key — same bucket = same fingerprint", async () => {
    const r1 = await parseOutcomeRow({ year: 2020, make: "Toyota", model: "Camry", mileage: 51000, price_paid: 18000, week_label: "2024-W01", buyer_id: "b1" });
    const r2 = await parseOutcomeRow({ year: 2020, make: "Toyota", model: "Camry", mileage: 58000, price_paid: 18000, week_label: "2024-W01", buyer_id: "b1" });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.data.importFingerprint).toBe(r2.data.importFingerprint);
  });

  // ── Edge: non-object rows ─────────────────────────────────────────────────

  it("null input returns reasonCode: invalid_row_type", async () => {
    const result = await parseOutcomeRow(null);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("invalid_row_type");
  });

  it("array input returns reasonCode: invalid_row_type", async () => {
    const result = await parseOutcomeRow([{ vin: "1HGCM82633A004352", price_paid: 14000 }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonCode).toBe("invalid_row_type");
  });
});
