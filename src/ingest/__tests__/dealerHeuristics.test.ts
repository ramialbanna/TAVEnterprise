import { describe, expect, it } from "vitest";

import {
  classifyListingSellerHeuristic,
  shouldAutoRejectDealer,
} from "../dealerHeuristics";

describe("classifyListingSellerHeuristic", () => {
  it("auto-rejects a listing that names the dealership and financing", () => {
    const result = classifyListingSellerHeuristic({
      title: "2018 F-150 XLT",
      description: "We finance! Bad credit OK. Visit our lot. Stock #A4421",
      sellerName: "Metro Auto Group",
    });
    expect(result.sellerType).toBe("dealer");
    expect(shouldAutoRejectDealer(result)).toBe(true);
    expect(result.signals).toEqual(
      expect.arrayContaining(["we_finance", "bad_credit", "visit_our_lot", "stock_number", "auto_group"]),
    );
  });

  it("auto-rejects a licensed dealer with a business suffix", () => {
    const result = classifyListingSellerHeuristic({
      title: "2019 Ram 1500",
      sellerName: "Texas Motors LLC",
      description: "Licensed dealer. Our inventory is updated daily.",
    });
    expect(shouldAutoRejectDealer(result)).toBe(true);
    expect(result.signals).toEqual(
      expect.arrayContaining(["licensed_dealer", "business_suffix", "motors_name", "our_inventory"]),
    );
  });

  it("does not auto-reject a private party who mentions a clean CARFAX", () => {
    const result = classifyListingSellerHeuristic({
      title: "2018 F-150 XLT 4x4 89k",
      description: "Clean title, clean CARFAX, one owner, text me.",
      sellerName: "James",
    });
    expect(shouldAutoRejectDealer(result)).toBe(false);
    expect(result.signals).toEqual(["carfax"]);
    expect(result.confidence).toBeLessThan(0.85);
  });

  it("returns unknown when there is no dealer language", () => {
    const result = classifyListingSellerHeuristic({
      title: "2016 Honda CR-V EX 120k",
      description: "Great daily driver, asking 9500 OBO.",
      sellerName: "Maria",
    });
    expect(result).toMatchObject({ sellerType: "unknown", confidence: 0, signals: [], source: "heuristic" });
    expect(shouldAutoRejectDealer(result)).toBe(false);
  });

  it("needs two medium signals to auto-reject", () => {
    const motorsOnly = classifyListingSellerHeuristic({ sellerName: "Joe Motors" });
    expect(shouldAutoRejectDealer(motorsOnly)).toBe(false);

    const motorsAndLlc = classifyListingSellerHeuristic({ sellerName: "Joe Motors LLC" });
    expect(shouldAutoRejectDealer(motorsAndLlc)).toBe(true);
  });

  it("auto-rejects a down-payment BHPH listing", () => {
    const result = classifyListingSellerHeuristic({
      title: "2016 GMC Z71 Sierra SLT 4x4",
      description: "2016 GMC Sierra Z71 4x4\nLevantada\n125K miles\nDown payment $5000\nen banco y en casa",
    });
    expect(result.signals).toContain("down_payment");
    expect(shouldAutoRejectDealer(result)).toBe(true);
  });

  it("auto-rejects a listing sold by a named Cars LLC", () => {
    const result = classifyListingSellerHeuristic({
      title: "2019 Cadillac Escalade ESV",
      description: "This vehicle is for sale by ARROYOS XCLUSIVE CARS LLC 2.\nYear : 2019",
    });
    expect(result.signals).toEqual(
      expect.arrayContaining(["this_vehicle_for_sale_by", "for_sale_by_business", "cars_llc"]),
    );
    expect(shouldAutoRejectDealer(result)).toBe(true);
  });

  it("does not treat for-sale-by-owner as a dealer", () => {
    const result = classifyListingSellerHeuristic({
      title: "2018 F-150 XLT",
      description: "For sale by owner. Clean title. Text me.",
    });
    expect(shouldAutoRejectDealer(result)).toBe(false);
  });
});
