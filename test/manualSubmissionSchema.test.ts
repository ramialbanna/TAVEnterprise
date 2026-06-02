import { describe, it, expect } from "vitest";
import { ManualOpportunitySubmissionSchema } from "../src/manual/manualSubmissionSchema";

const VALID = {
  listingUrl: "https://www.facebook.com/marketplace/item/123",
  region: "dallas_tx" as const,
  year: 2020,
  make: "toyota",
  model: "camry",
  price: 15000,
};

describe("ManualOpportunitySubmissionSchema", () => {
  it("accepts WF-1 required fields with optional mileage omitted", () => {
    expect(ManualOpportunitySubmissionSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects missing region", () => {
    const { region: _region, ...rest } = VALID;
    expect(ManualOpportunitySubmissionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing price", () => {
    const { price: _price, ...rest } = VALID;
    expect(ManualOpportunitySubmissionSchema.safeParse(rest).success).toBe(false);
  });
});
