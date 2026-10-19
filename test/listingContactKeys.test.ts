import { describe, expect, it } from "vitest";

import { matchRepeatedListingContact } from "../src/persistence/listingContactKeys";

type Row = {
  source: string;
  listing_url: string;
  contact_key: string;
  vehicle_key: string;
  last_seen_at: string;
};

function fakeDb(seed: Row[], blockedKeys: string[] = []) {
  const rows = [...seed];
  return {
    rows,
    from(table: string) {
      if (table === "blocked_contact_keys") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              in(_column: string, keys: string[]) {
                return Promise.resolve({
                  data: blockedKeys
                    .filter((key) => keys.includes(key))
                    .map((contact_key) => ({ contact_key })),
                  error: null,
                });
              },
            };
          },
        };
      }
      return {
        upsert(incoming: Row[]) {
          for (const row of incoming) {
            const existing = rows.find(
              (stored) =>
                stored.listing_url === row.listing_url && stored.contact_key === row.contact_key,
            );
            if (existing) Object.assign(existing, row);
            else rows.push({ ...row });
          }
          return Promise.resolve({ error: null });
        },
        select() {
          const filters: { source?: string; keys?: string[]; since?: string } = {};
          const builder = {
            eq(column: string, value: string) {
              if (column === "source") filters.source = value;
              return builder;
            },
            in(column: string, value: string[]) {
              if (column === "contact_key") filters.keys = value;
              return builder;
            },
            gte(column: string, value: string) {
              if (column === "last_seen_at") filters.since = value;
              return Promise.resolve({
                data: rows.filter(
                  (row) =>
                    row.source === filters.source &&
                    filters.keys?.includes(row.contact_key) &&
                    row.last_seen_at >= (filters.since ?? ""),
                ),
                error: null,
              });
            },
          };
          return builder;
        },
      };
    },
  };
}

describe("matchRepeatedListingContact", () => {
  it("drops the third different car that repeats a phone", async () => {
    const phone = "phone:2145551212";
    const db = fakeDb([
      {
        source: "facebook",
        listing_url: "https://facebook.com/a",
        contact_key: phone,
        vehicle_key: "url:https://facebook.com/a",
        last_seen_at: new Date().toISOString(),
      },
      {
        source: "facebook",
        listing_url: "https://facebook.com/b",
        contact_key: phone,
        vehicle_key: "url:https://facebook.com/b",
        last_seen_at: new Date().toISOString(),
      },
    ]);

    const hit = await matchRepeatedListingContact(db as never, {
      listingUrl: "https://facebook.com/c",
      description: "Call 214-555-1212",
    });

    expect(hit).toEqual({
      contactKey: phone,
      vehicleCount: 3,
      otherListingUrls: ["https://facebook.com/a", "https://facebook.com/b"],
      source: "contact_repeat",
    });
  });

  it("keeps a phone that is only on two cars", async () => {
    const db = fakeDb([
      {
        source: "facebook",
        listing_url: "https://facebook.com/a",
        contact_key: "phone:2145551212",
        vehicle_key: "url:https://facebook.com/a",
        last_seen_at: new Date().toISOString(),
      },
    ]);

    const hit = await matchRepeatedListingContact(db as never, {
      listingUrl: "https://facebook.com/b",
      description: "Call 214-555-1212",
    });

    expect(hit).toBeNull();
  });

  it("counts two posts of the same VIN as one car", async () => {
    const vin = "1HGCM82633A004352";
    const db = fakeDb([
      {
        source: "facebook",
        listing_url: "https://facebook.com/a",
        contact_key: "url:joesautos.com",
        vehicle_key: `vin:${vin}`,
        last_seen_at: new Date().toISOString(),
      },
      {
        source: "facebook",
        listing_url: "https://facebook.com/b",
        contact_key: "url:joesautos.com",
        vehicle_key: "url:https://facebook.com/b",
        last_seen_at: new Date().toISOString(),
      },
    ]);

    const hit = await matchRepeatedListingContact(db as never, {
      listingUrl: "https://facebook.com/c",
      vin,
      description: "https://joesautos.com",
    });

    expect(hit).toBeNull();
  });

  it("does nothing when the ad has no contact", async () => {
    const db = fakeDb([]);
    const hit = await matchRepeatedListingContact(db as never, {
      listingUrl: "https://facebook.com/a",
      description: "Clean title, one owner.",
    });
    expect(hit).toBeNull();
    expect(db.rows).toHaveLength(0);
  });

  it("drops the next car when a buyer already flagged that phone", async () => {
    const db = fakeDb([], ["phone:2145551212"]);
    const hit = await matchRepeatedListingContact(db as never, {
      listingUrl: "https://facebook.com/new",
      description: "Text 214-555-1212",
    });
    expect(hit).toMatchObject({
      contactKey: "phone:2145551212",
      source: "buyer_contact",
      vehicleCount: 1,
    });
  });

  it("drops the third car that pastes the same long description", async () => {
    const description = [
      "We finance everyone. Bad credit is welcome. Come see the lot on Harry Hines today.",
      "Ask for the internet manager. Every vehicle is inspected and ready for delivery.",
    ].join(" ");
    const seen = fakeDb([]);
    const first = await matchRepeatedListingContact(seen as never, {
      listingUrl: "https://facebook.com/a",
      description,
    });
    expect(first).toBeNull();
    const copyKey = seen.rows.find((row) => row.contact_key.startsWith("copy:"))?.contact_key;
    expect(copyKey).toBeTruthy();

    const third = fakeDb([
      {
        source: "facebook",
        listing_url: "https://facebook.com/a",
        contact_key: copyKey!,
        vehicle_key: "url:https://facebook.com/a",
        last_seen_at: new Date().toISOString(),
      },
      {
        source: "facebook",
        listing_url: "https://facebook.com/b",
        contact_key: copyKey!,
        vehicle_key: "url:https://facebook.com/b",
        last_seen_at: new Date().toISOString(),
      },
    ]);
    const hit = await matchRepeatedListingContact(third as never, {
      listingUrl: "https://facebook.com/c",
      description,
    });
    expect(hit).toMatchObject({
      contactKey: copyKey,
      vehicleCount: 3,
      source: "contact_repeat",
    });
  });
});
