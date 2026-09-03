import { describe, expect, it } from "vitest";

import {
  findVinInText,
  hasValidVinCheckDigit,
  isValidVin,
  resolveListingVin,
  vinModelYear,
} from "../extractVinFromText";

/**
 * Real VINs taken from production listing descriptions (2026-08-13). All 133
 * sampled candidates passed the check digit, so these double as a regression
 * fixture for the transliteration table.
 */
const REAL_VINS: Array<[string, number]> = [
  ["1FMSK8DH9LGA93268", 2020], // Ford Explorer
  ["1C4HJXDN7LW170128", 2020], // Jeep Wrangler Unlimited
  ["1C6SRFJT5PN513601", 2023], // Ram 1500
  ["19XFB2F81FE037586", 2015], // Honda Civic
  ["JN8AT2MT2HW385845", 2017], // Nissan Rogue
  ["WDCGG5HB8DF949922", 2013], // Mercedes GLK
  ["5TFUY5F14LX951983", 2020], // Toyota Tundra
  ["2GNFLGE31G6214145", 2016], // Chevrolet Equinox
  ["1C4RJFAGXCC321386", 2012], // Jeep Grand Cherokee, check digit X
];

describe("hasValidVinCheckDigit", () => {
  it("accepts every real production VIN", () => {
    for (const [vin] of REAL_VINS) {
      expect(hasValidVinCheckDigit(vin), vin).toBe(true);
    }
  });

  it("rejects a VIN with a transposed character", () => {
    expect(hasValidVinCheckDigit("1FMSK8DH9LGA93286")).toBe(false);
  });

  it("handles the X check digit", () => {
    expect(hasValidVinCheckDigit("1C4RJFAGXCC321386")).toBe(true);
  });
});

describe("isValidVin", () => {
  it("rejects the wrong length", () => {
    expect(isValidVin("1FMSK8DH9LGA9326")).toBe(false);
    expect(isValidVin("1FMSK8DH9LGA932688")).toBe(false);
  });

  it("rejects I, O and Q, which ISO 3779 excludes", () => {
    expect(isValidVin("1FMSK8DHOLGA93268")).toBe(false);
  });
});

describe("vinModelYear", () => {
  it("decodes the 2010-2039 cycle", () => {
    expect(vinModelYear("1FMSK8DH9LGA93268")).toBe(2020);
    expect(vinModelYear("WDCGG5HB8DF949922")).toBe(2013);
    expect(vinModelYear("1C4RJFAGXCC321386")).toBe(2012);
  });
});

describe("findVinInText", () => {
  it("pulls a VIN out of seller prose", () => {
    expect(findVinInText("Clean title, VIN 1FMSK8DH9LGA93268, runs great", 2020)).toBe(
      "1FMSK8DH9LGA93268",
    );
  });

  it("is case-insensitive and tolerates punctuation around the VIN", () => {
    expect(findVinInText("vin: 1c4hjxdn7lw170128.", 2020)).toBe("1C4HJXDN7LW170128");
  });

  it("ignores a 17-char window inside a longer token", () => {
    expect(findVinInText("stock 991FMSK8DH9LGA9326899", 2020)).toBeUndefined();
  });

  it("rejects a VIN whose model year contradicts the listing", () => {
    // Seen in production on both a 2013 and a "2016" Yaris listing.
    expect(findVinInText("VIN JTDJTUD39DD550142", 2013)).toBe("JTDJTUD39DD550142");
    expect(findVinInText("VIN JTDJTUD39DD550142", 2016)).toBeUndefined();
  });

  it("allows one model year of drift", () => {
    expect(findVinInText("VIN 1FMSK8DH9LGA93268", 2019)).toBe("1FMSK8DH9LGA93268");
    expect(findVinInText("VIN 1FMSK8DH9LGA93268", 2021)).toBe("1FMSK8DH9LGA93268");
  });

  it("accepts any year when the listing year is unknown", () => {
    expect(findVinInText("VIN 1FMSK8DH9LGA93268")).toBe("1FMSK8DH9LGA93268");
  });

  it("refuses to guess when the text holds two different VINs", () => {
    const text = "Also selling 1FMSK8DH9LGA93268 and 1C6SRFJT5PN513601";
    expect(findVinInText(text)).toBeUndefined();
  });

  it("tolerates the same VIN repeated", () => {
    expect(findVinInText("1FMSK8DH9LGA93268 — repeat 1FMSK8DH9LGA93268", 2020)).toBe(
      "1FMSK8DH9LGA93268",
    );
  });

  it("ignores 17-char junk that is not a VIN", () => {
    expect(findVinInText("ABCDEFGHJKLMNPRST")).toBeUndefined();
    expect(findVinInText("")).toBeUndefined();
    expect(findVinInText(null)).toBeUndefined();
  });
});

describe("resolveListingVin", () => {
  it("prefers a structured field over parsed text", () => {
    expect(
      resolveListingVin({
        structured: "1C6SRFJT5PN513601",
        description: "VIN 1FMSK8DH9LGA93268",
        year: 2023,
      }),
    ).toBe("1C6SRFJT5PN513601");
  });

  it("falls back to the description when no structured field exists", () => {
    expect(resolveListingVin({ description: "vin 1FMSK8DH9LGA93268", year: 2020 })).toBe(
      "1FMSK8DH9LGA93268",
    );
  });

  it("falls back to the title last", () => {
    expect(
      resolveListingVin({ title: "2020 Explorer 1FMSK8DH9LGA93268", description: "no vin here" }),
    ).toBe("1FMSK8DH9LGA93268");
  });

  it("returns undefined when nothing valid is present", () => {
    expect(resolveListingVin({ description: "call me", title: "2020 Ford Explorer" })).toBeUndefined();
  });
});
