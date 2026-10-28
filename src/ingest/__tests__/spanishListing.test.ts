import { describe, expect, it } from "vitest";

import { matchSpanishListing } from "../spanishListing";

describe("matchSpanishListing", () => {
  it("keeps a listing whose only Spanish-looking word is el", () => {
    expect(
      matchSpanishListing({
        title: "2019 Ford F-150 for sale in El Paso",
        description: "Clean title. 80k miles. Runs great.",
      }),
    ).toBeNull();
  });

  it("keeps a listing whose only Spanish-looking word is la", () => {
    expect(
      matchSpanishListing({
        title: "2018 Honda Civic in LA",
        description: "One owner, clean title, no issues.",
      }),
    ).toBeNull();
  });

  it("keeps a year make model title with no description", () => {
    expect(matchSpanishListing({ title: "2020 Toyota Camry SE" })).toBeNull();
  });

  it("keeps an English ad that uses one Spanish word", () => {
    expect(
      matchSpanishListing({
        title: "2017 Chevy Silverado",
        description: "Clean title, 110k miles. Precio is firm.",
      }),
    ).toBeNull();
  });

  it("drops a listing that says se vende", () => {
    expect(
      matchSpanishListing({
        title: "2016 Toyota Corolla",
        description: "Se vende.",
      }),
    ).toEqual({ matched: ["se vende"] });
  });

  it("drops está como nuevo", () => {
    expect(
      matchSpanishListing({
        title: "2024 Toyota Camry",
        description: "Está como nuevo",
      })?.matched,
    ).toEqual(expect.arrayContaining(["nuevo", "como", "esta"]));
  });

  it("drops titulo limpio plus vendo", () => {
    const match = matchSpanishListing({
      title: "2019 Ford F-250",
      description: "Título limpio. Vendo por poco uso.",
    });
    expect(match).not.toBeNull();
    expect(match?.matched).toEqual(expect.arrayContaining(["titulo", "limpio", "vendo"]));
  });

  it("does not treat el and la together as Spanish", () => {
    expect(
      matchSpanishListing({
        title: "El camino to LA",
        description: "Clean truck, ready to go.",
      }),
    ).toBeNull();
  });
});
