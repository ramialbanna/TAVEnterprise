import { describe, expect, it } from "vitest";

import { listingHasSalvageOrRebuiltTitle, matchSalvageOrRebuiltTitle } from "../listingTitleStatus";

describe("matchSalvageOrRebuiltTitle", () => {
  it("rejects an affirmative salvage title", () => {
    expect(matchSalvageOrRebuiltTitle("Salvage title, runs great")).toEqual({
      kind: "salvage",
      matched: "Salvage title",
    });
  });

  it("rejects an affirmative rebuilt title", () => {
    expect(matchSalvageOrRebuiltTitle("Rebuilt title in hand")).toMatchObject({ kind: "rebuilt" });
  });

  it("keeps a listing that says it is not salvage", () => {
    expect(matchSalvageOrRebuiltTitle("Clean title, no salvage, one owner")).toBeNull();
  });

  it("keeps a listing that says not a rebuilt title", () => {
    expect(matchSalvageOrRebuiltTitle("Not a rebuilt title. Clean Texas title.")).toBeNull();
  });

  it("reads title plus description", () => {
    expect(
      listingHasSalvageOrRebuiltTitle({
        title: "2018 F-150 XLT",
        description: "Flood title, priced accordingly.",
      }),
    ).toMatchObject({ kind: "salvage" });
  });
});
