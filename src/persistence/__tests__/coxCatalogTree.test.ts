import { describe, expect, it } from "vitest";

import { loadCoxCatalogTreeForMake } from "../coxCatalogTree";
import type { SupabaseClient } from "../supabase";

type Row = {
  year: number;
  make: string;
  model: string;
  style: string;
  search_text: string;
  variant_kind: string | null;
};

function row(make: string, model: string, style: string): Row {
  return { year: 2018, make, model, style, search_text: "", variant_kind: null };
}

/**
 * Mimics PostgREST: `ilike` is case-insensitive and honours `%` wildcards, but
 * is not punctuation-insensitive — which is the whole reason `bmw` never found
 * `B M W`.
 */
function makeDb(rows: Row[]): { db: SupabaseClient; patterns: string[] } {
  const patterns: string[] = [];
  const db = {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: (_col: string, year: number) => ({
            ilike: (_makeCol: string, pattern: string) => {
              patterns.push(pattern);
              const re = new RegExp(
                `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`,
                "i",
              );
              const data = rows.filter((r) => r.year === year && re.test(r.make));
              return Promise.resolve({ data, error: null });
            },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, patterns };
}

describe("loadCoxCatalogTreeForMake — item 72 BMW vocabulary gap", () => {
  const ROWS = [
    row("B M W", "X SERIES", "4D SUV X3 XDRIVE30I"),
    row("B M W", "3 SERIES", "4D SEDAN 330I"),
    row("CHEVROLET", "MALIBU", "4D SEDAN LT"),
  ];

  it("finds Cox's `B M W` when the listing says `bmw`", async () => {
    const { db } = makeDb(ROWS);
    const result = await loadCoxCatalogTreeForMake(db, 2018, "bmw");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.make === "B M W")).toBe(true);
    expect(result.map((r) => r.model)).toEqual(["X SERIES", "3 SERIES"]);
  });

  it("only falls back to the wildcard pattern when the exact lookup found nothing", async () => {
    const { db, patterns } = makeDb(ROWS);
    await loadCoxCatalogTreeForMake(db, 2018, "chevrolet");
    expect(patterns).toEqual(["chevrolet"]);
  });

  it("uses the interleaved pattern only to narrow, then verifies the make", async () => {
    const { db, patterns } = makeDb([...ROWS, row("BUICK", "ENCLAVE", "4D SUV")]);
    const result = await loadCoxCatalogTreeForMake(db, 2018, "bmw");
    expect(patterns).toEqual(["bmw", "b%m%w"]);
    // The pattern is loose enough to reach other makes; squashed equality is
    // what decides, so nothing but B M W comes back.
    expect(result.every((r) => r.make === "B M W")).toBe(true);
  });

  it("returns nothing for a make Cox does not carry", async () => {
    const { db } = makeDb(ROWS);
    expect(await loadCoxCatalogTreeForMake(db, 2018, "peugeot")).toEqual([]);
  });

  it("maps rows into the matcher's shape", async () => {
    const { db } = makeDb([
      { ...row("B M W", "X SERIES", "4D SUV"), search_text: "2018 b m w x series", variant_kind: "base" },
    ]);
    const [result] = await loadCoxCatalogTreeForMake(db, 2018, "bmw");
    expect(result).toEqual({
      year: 2018,
      make: "B M W",
      model: "X SERIES",
      style: "4D SUV",
      searchText: "2018 b m w x series",
      variantKind: "base",
    });
  });
});
