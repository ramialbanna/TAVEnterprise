import { describe, expect, it } from "vitest";
import { extractManheimMarketContext } from "../manheimMarketContextParser";

const COX_HISTORICAL_FORECAST_ITEM = {
  historicalAverages: {
    last30Days: { odometer: 65563, price: 18900 },
    lastSixMonths: { odometer: 57567, price: 18250 },
    lastYear: { odometer: 51440, price: 21900 },
  },
  forecast: {
    nextMonth: { wholesale: 18900, retail: 21200 },
    nextYear: { wholesale: 16800, retail: 19300 },
  },
};

const COX_PAYLOAD = {
  count: 1,
  items: [COX_HISTORICAL_FORECAST_ITEM],
};

describe("extractManheimMarketContext — historical + forecast", () => {
  it("extracts Cox historical slots and next-month wholesale forecast", () => {
    const ctx = extractManheimMarketContext(COX_PAYLOAD);
    expect(ctx.historicalAverages).toEqual({
      past30Days: { price: 18900, avgMileage: 65563 },
      sixMonthsAgo: { price: 18250, avgMileage: 57567 },
      lastYear: { price: 21900, avgMileage: 51440 },
    });
    expect(ctx.projectedAverage).toEqual({ price: 18900, avgMileage: null });
    expect(ctx.transactions).toEqual([]);
  });

  it("returns empty context for payloads without market fields", () => {
    const ctx = extractManheimMarketContext({
      items: [{ adjustedPricing: { wholesale: { average: 2100 } } }],
    });
    expect(ctx).toEqual({
      historicalAverages: null,
      projectedAverage: null,
      transactions: [],
    });
  });

  it("handles root-level payload without items array", () => {
    const ctx = extractManheimMarketContext(COX_HISTORICAL_FORECAST_ITEM);
    expect(ctx.historicalAverages?.past30Days?.price).toBe(18900);
    expect(ctx.projectedAverage?.price).toBe(18900);
  });
});

describe("extractManheimMarketContext — transactions", () => {
  it("maps transaction rows when Cox returns a transactions array", () => {
    const ctx = extractManheimMarketContext({
      items: [{
        ...COX_HISTORICAL_FORECAST_ITEM,
        transactions: [{
          saleDate: "2026-04-15",
          salePrice: 18750,
          odometer: 64200,
          grade: 42,
          evbh: 88,
          engineTransmission: "2.5L / A",
          exteriorColor: "Black",
          saleType: "Auction",
          region: "Southeast",
          auctionName: "Manheim Atlanta",
        }],
      }],
    });

    expect(ctx.transactions).toHaveLength(1);
    expect(ctx.transactions[0]).toMatchObject({
      date: "2026-04-15",
      price: 18750,
      odometer: 64200,
      grade: "4.2",
      evbh: 88,
      engineTrans: "2.5L / A",
      exteriorColor: "Black",
      type: "Auction",
      region: "Southeast",
      auction: "Manheim Atlanta",
    });
  });

  it("ignores malformed transaction rows", () => {
    const ctx = extractManheimMarketContext({
      items: [{ transactions: [{}, null, 42] }],
    });
    expect(ctx.transactions).toEqual([]);
  });
});
