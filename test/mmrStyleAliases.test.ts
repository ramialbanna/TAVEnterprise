import { describe, expect, it, vi } from "vitest";

import {
  buildListingStyleAliasKey,
  listListingStyleAliasLookupKeys,
  lookupMmrStyleAlias,
  lookupMmrStyleAliasWithFallback,
} from "../src/persistence/mmrStyleAliases";
import type { SupabaseClient } from "../src/persistence/supabase";

type AliasRow = {
  alias: string;
  canonical_make: string;
  canonical_model: string;
  canonical_style: string;
  source: string;
};

function makeAliasDb(rows: AliasRow[]): SupabaseClient {
  const query = (alias: string) => ({
    limit: async (n: number) => ({ data: rows.filter((r) => r.alias === alias).slice(0, n), error: null }),
  });
  return {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: (_col: string, alias: string) => query(alias) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const tundra2wd: AliasRow = {
  alias: "toyota|tundra sr5|sr5",
  canonical_make: "TOYOTA",
  canonical_model: "TUNDRA 2WD V6",
  canonical_style: "CREW CAB 3.4L SR5",
  source: "ingest_learned",
};
const tundra4wd: AliasRow = { ...tundra2wd, canonical_model: "TUNDRA 4WD", canonical_style: "DOUBLE CAB 5.7L SR5" };

describe("lookupMmrStyleAlias", () => {
  it("returns the mapping when the key has exactly one row", async () => {
    const hit = await lookupMmrStyleAlias(makeAliasDb([tundra2wd]), tundra2wd.alias);
    expect(hit).toEqual({
      alias: tundra2wd.alias,
      canonicalMake: "TOYOTA",
      canonicalModel: "TUNDRA 2WD V6",
      canonicalStyle: "CREW CAB 3.4L SR5",
      source: "ingest_learned",
    });
  });

  it("treats a key with two different mappings as no hit instead of throwing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(lookupMmrStyleAlias(makeAliasDb([tundra2wd, tundra4wd]), tundra2wd.alias)).resolves.toBeNull();
  });

  it("falls through to the next key when the first key is ambiguous", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fallback: AliasRow = { ...tundra2wd, alias: "toyota|tundra sr5|", canonical_model: "TUNDRA 4WD" };
    const hit = await lookupMmrStyleAliasWithFallback(
      makeAliasDb([tundra2wd, tundra4wd, fallback]),
      "toyota",
      "tundra sr5",
      "sr5",
    );
    expect(hit?.alias).toBe("toyota|tundra sr5|");
  });
});

describe("buildListingStyleAliasKey lookup order", () => {
  it("prefers explicit trim, then title trim, then empty (documented order for lookupMmrStyleAliasWithFallback)", () => {
    expect(buildListingStyleAliasKey("jeep", "wrangler unlimited", "sport")).toBe(
      "jeep|wrangler unlimited|sport",
    );
    expect(buildListingStyleAliasKey("jeep", "wrangler unlimited", null)).toBe(
      "jeep|wrangler unlimited|",
    );
  });

  it("appends drivetrain and engine tokens after trim", () => {
    expect(buildListingStyleAliasKey("ford", "f-150", "xlt", ["4wd", "v6"])).toBe(
      "ford|f-150|xlt|4wd|v6",
    );
  });
});

describe("listListingStyleAliasLookupKeys", () => {
  it("tries explicit trim, then title trim, then empty when the listing has no axis evidence", () => {
    expect(
      listListingStyleAliasLookupKeys("jeep", "wrangler unlimited", "sport", "sahara"),
    ).toEqual([
      "jeep|wrangler unlimited|sport",
      "jeep|wrangler unlimited|sahara",
      "jeep|wrangler unlimited|",
    ]);
  });

  it("does not fall back to the short make|model|trim key when axis evidence is present", () => {
    expect(
      listListingStyleAliasLookupKeys("ford", "f-150", "xlt", "xlt", ["4wd", "v6"]),
    ).toEqual(["ford|f-150|xlt|4wd|v6"]);
  });

  it("still tries title trim with the same axes, but never an empty-trim catch-all", () => {
    expect(
      listListingStyleAliasLookupKeys("ford", "f-150", "xlt", "lariat", ["4wd", "v8"]),
    ).toEqual(["ford|f-150|xlt|4wd|v8", "ford|f-150|lariat|4wd|v8"]);
  });
});
