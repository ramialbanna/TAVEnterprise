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
    expect(result.styleEstimated).toBe(true);
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
});
