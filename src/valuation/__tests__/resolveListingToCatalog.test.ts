import { describe, expect, it } from "vitest";
import { matchCatalogOption, pickCatalogOptionFuzzy } from "../matchCatalogOption";
import { resolveListingToCatalogForIngest } from "../resolveListingToCatalog";
import type { CatalogFetchResult } from "../resolveListingToCatalog";

function mockCatalog(
  routes: Record<string, CatalogFetchResult>,
): (path: string) => Promise<CatalogFetchResult | null> {
  return async (path: string) => routes[path] ?? null;
}

describe("matchCatalogOption", () => {
  it("matches case-insensitively", () => {
    expect(matchCatalogOption(["Honda", "Toyota"], "honda")).toBe("Honda");
  });
});

describe("pickCatalogOptionFuzzy", () => {
  it("matches when listing model contains catalog model", () => {
    expect(pickCatalogOptionFuzzy(["Sportage", "Sorento"], "sportage fe")).toBe("Sportage");
  });
});

describe("resolveListingToCatalogForIngest", () => {
  it("case-matches honda / odyssey and selects catalog style", async () => {
    const fetchCatalog = mockCatalog({
      "/catalog/years/2020/makes": {
        catalogState: "connected",
        items: ["Honda", "Toyota"],
      },
      "/catalog/years/2020/makes/Honda/models": {
        catalogState: "connected",
        items: ["Odyssey", "Accord"],
      },
      "/catalog/years/2020/makes/Honda/models/Odyssey/styles": {
        catalogState: "connected",
        items: ["MINIVAN EX", "MINIVAN LX"],
      },
    });

    const result = await resolveListingToCatalogForIngest(
      {
        year: 2020,
        make: "honda",
        model: "odyssey",
        trim: "minivan ex",
      },
      fetchCatalog,
    );

    expect(result).toEqual({
      make: "Honda",
      model: "Odyssey",
      style: "MINIVAN EX",
      styleEstimated: false,
      unmatched: [],
      catalogConnected: true,
      modelVariantAmbiguous: false,
    });
  });

  it("strips verbose Sportage FE model into Cox model + style", async () => {
    const fetchCatalog = mockCatalog({
      "/catalog/years/2018/makes": {
        catalogState: "connected",
        items: ["Kia"],
      },
      "/catalog/years/2018/makes/Kia/models": {
        catalogState: "connected",
        items: ["Sportage", "Sorento"],
      },
      "/catalog/years/2018/makes/Kia/models/Sportage/styles": {
        catalogState: "connected",
        items: ["4D SUV LX", "4D SUV FE"],
      },
    });

    const result = await resolveListingToCatalogForIngest(
      {
        year: 2018,
        make: "kia",
        model: "sportage fe",
        title: "2018 Kia Sportage FE",
      },
      fetchCatalog,
    );

    expect(result.make).toBe("Kia");
    expect(result.model).toBe("Sportage");
    expect(result.style).toMatch(/FE/i);
    expect(result.styleEstimated).toBe(false);
  });

  it("selects drivetrain model variant when catalog splits the model", async () => {
    const fetchCatalog = mockCatalog({
      "/catalog/years/2021/makes": {
        catalogState: "connected",
        items: ["Kia"],
      },
      "/catalog/years/2021/makes/Kia/models": {
        catalogState: "connected",
        items: ["K5 AWD", "K5 FWD"],
      },
      "/catalog/years/2021/makes/Kia/models/K5%20AWD/styles": {
        catalogState: "connected",
        items: ["4D SEDAN GT-LINE", "4D SEDAN LXS"],
      },
    });

    const result = await resolveListingToCatalogForIngest(
      {
        year: 2021,
        make: "Kia",
        model: "K5",
        trim: "GT-Line",
        title: "2021 Kia K5 AWD GT-Line Sedan 4D",
      },
      fetchCatalog,
    );

    expect(result.make).toBe("Kia");
    expect(result.model).toBe("K5 AWD");
    expect(result.style).toBe("4D SEDAN GT-LINE");
  });

  it("auto-picks a Cox model variant via style scoring when drivetrain is absent", async () => {
    const fetchCatalog = mockCatalog({
      "/catalog/years/2016/makes": {
        catalogState: "connected",
        items: ["Honda"],
      },
      "/catalog/years/2016/makes/Honda/models": {
        catalogState: "connected",
        items: ["CR-V AWD", "CR-V FWD", "CR-Z HYBRID"],
      },
      "/catalog/years/2016/makes/Honda/models/CR-V%20AWD/styles": {
        catalogState: "connected",
        items: ["4D Sport Utility EX-L", "4D Sport Utility LX"],
      },
      "/catalog/years/2016/makes/Honda/models/CR-V%20FWD/styles": {
        catalogState: "connected",
        items: ["4D Sport Utility LX", "4D Sport Utility SE"],
      },
    });

    const result = await resolveListingToCatalogForIngest(
      {
        year: 2016,
        make: "Honda",
        model: "CR-V",
        trim: "EX-L",
        title: "2016 Honda CR-V EX-L Sport Utility 4D",
      },
      fetchCatalog,
    );

    expect(result.model).toBe("CR-V AWD");
    expect(result.style).toBe("4D Sport Utility EX-L");
    expect(result.variantEstimated).toBe(true);
    expect(result.modelVariantAmbiguous).toBe(false);
    expect(result.catalogMatchSuggestions?.length).toBeGreaterThan(0);
  });

  it("returns suggestions when Cox variants tie on style evidence", async () => {
    const fetchCatalog = mockCatalog({
      "/catalog/years/2016/makes": {
        catalogState: "connected",
        items: ["Honda"],
      },
      "/catalog/years/2016/makes/Honda/models": {
        catalogState: "connected",
        items: ["CR-V AWD", "CR-V FWD", "CR-Z HYBRID"],
      },
      "/catalog/years/2016/makes/Honda/models/CR-V%20AWD/styles": {
        catalogState: "connected",
        items: ["4D Sport Utility LX"],
      },
      "/catalog/years/2016/makes/Honda/models/CR-V%20FWD/styles": {
        catalogState: "connected",
        items: ["4D Sport Utility LX"],
      },
    });

    const result = await resolveListingToCatalogForIngest(
      {
        year: 2016,
        make: "Honda",
        model: "CR-V",
        trim: "Sport Utility",
        title: "2016 Honda CR-V Sport Utility 4D",
      },
      fetchCatalog,
    );

    expect(result.model).toBeNull();
    expect(result.modelVariantAmbiguous).toBe(true);
    expect(result.catalogMatchSuggestions).toHaveLength(2);
  });

  it("item 64: picks style from description when title is sparse", async () => {
    const fetchCatalog = mockCatalog({
      "/catalog/years/2016/makes": {
        catalogState: "connected",
        items: ["Ford"],
      },
      "/catalog/years/2016/makes/Ford/models": {
        catalogState: "connected",
        items: ["F-150"],
      },
      "/catalog/years/2016/makes/Ford/models/F-150/styles": {
        catalogState: "connected",
        items: ["4D CREW CAB XLT", "4D CREW CAB XL", "4D REGULAR CAB XL"],
      },
    });

    const result = await resolveListingToCatalogForIngest(
      {
        year: 2016,
        make: "Ford",
        model: "F-150",
        title: "2016 Ford F-150 · Short Bed",
        description:
          "2016 Ford F-150 SuperCrew XLT 4x4, 5.0L V8, short bed, clean title, 89k miles.",
      },
      fetchCatalog,
    );

    expect(result.make).toBe("Ford");
    expect(result.model).toBe("F-150");
    expect(result.style).toBe("4D CREW CAB XLT");
  });

  it("does not value a GLC 300 SUV as the first AMG catalog style", async () => {
    const fetchCatalog = mockCatalog({
      "/catalog/years/2022/makes": {
        catalogState: "connected",
        items: ["MERCEDES-BENZ"],
      },
      "/catalog/years/2022/makes/MERCEDES-BENZ/models": {
        catalogState: "connected",
        items: ["GLC"],
      },
      "/catalog/years/2022/makes/MERCEDES-BENZ/models/GLC/styles": {
        catalogState: "connected",
        items: [
          "4D SEDAN AMG GLC 43 4MATIC",
          "4D SEDAN GLC 300 4MATIC",
          "4D SUV AMG GLC 43 4MATIC",
          "4D SUV GLC 300",
          "4D SUV GLC 300 4MATIC",
        ],
      },
    });

    const result = await resolveListingToCatalogForIngest(
      {
        year: 2022,
        make: "mercedes-benz",
        model: "glc 300",
        trim: "sport",
        title: "2022 Mercedes-Benz GLC · GLC 300 Sport Utility 4D",
      },
      fetchCatalog,
    );

    expect(result.make).toBe("MERCEDES-BENZ");
    expect(result.model).toBe("GLC");
    expect(result.style).toMatch(/GLC 300/);
    expect(result.style).toMatch(/SUV/);
    expect(result.style).not.toMatch(/AMG/);
  });
});
