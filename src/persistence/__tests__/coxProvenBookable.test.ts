import { describe, expect, it } from "vitest";

import { loadProvenBookableForMake } from "../coxProvenBookable";
import type { SupabaseClient } from "../supabase";

type Row = { year: number; make: string; model: string; style: string };

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
              const data = rows
                .filter((r) => r.year === year && re.test(r.make))
                .map(({ make, model, style }) => ({ make, model, style }));
              return {
                limit: () => Promise.resolve({ data, error: null }),
              };
            },
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, patterns };
}

describe("loadProvenBookableForMake", () => {
  const ROWS: Row[] = [
    { year: 2018, make: "B M W", model: "X SERIES", style: "4D SUV X3 XDRIVE30I" },
    { year: 2018, make: "B M W", model: "3 SERIES", style: "4D SEDAN 330I" },
    { year: 2018, make: "FORD", model: "F-150", style: "SUPERCREW XLT" },
  ];

  it("finds Cox's `B M W` when the listing says `bmw`", async () => {
    const { db } = makeDb(ROWS);
    const result = await loadProvenBookableForMake(db, 2018, "bmw");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.make === "B M W")).toBe(true);
  });

  it("only falls back to the wildcard pattern when the exact lookup found nothing", async () => {
    const { db, patterns } = makeDb(ROWS);
    await loadProvenBookableForMake(db, 2018, "ford");
    expect(patterns).toEqual(["ford"]);
  });

  it("returns nothing for a make that has never booked", async () => {
    const { db } = makeDb(ROWS);
    expect(await loadProvenBookableForMake(db, 2018, "peugeot")).toEqual([]);
  });
});
