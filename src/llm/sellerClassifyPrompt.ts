/**
 * Item 71 Phase 1 — seller-type classifier prompt. Separate from the item 57
 * Y/M/M/S prompt on purpose: this is a cheap yes/no-ish filter, not identity.
 */

export type SellerClassifyProposal = {
  seller_type: "dealer" | "private_party" | "curbstoner_suspected" | "unknown";
  confidence: number;
  reasoning: string;
  signals: string[];
};

export const SELLER_CLASSIFY_TOOL_NAME = "classify_listing_seller";

export const SELLER_CLASSIFY_SYSTEM_PROMPT =
  "You classify whether a used-car Marketplace listing is a dealership, a private party, " +
  "or a suspected curbstoner (someone flipping cars without a lot). " +
  "Texas Auto Value only wants private-party cars. " +
  "Be conservative on photos alone: if the photo could reasonably be a private owner, do not call it a dealer. " +
  "A mention of CARFAX or a clean title is normal for private sellers and is not dealer evidence. " +
  "Dealer evidence in text: business identity (Auto Group, Motors, LLC, Cars LLC, dealership), " +
  "'this vehicle is for sale by' a company, inventory language (stock #, our lot, we have 50 vehicles), " +
  "down payment / enganche / BHPH, or in-house financing / bad-credit / no-social ads. " +
  "Text that names a business selling the car, or asks for a down payment, is a dealer even when the photo is a single car. " +
  "Do not let a driveway-looking photo override explicit dealer identity in the text. " +
  "Dealer evidence in photos: a sales lot (rows of inventory, pennant flags, gravel/asphalt lot lighting), " +
  "windshield price banners, dealer license plates, or a dealership name/watermark. " +
  "A single vehicle in a driveway, apartment lot, suburban street, or a close-up of one car is private-party " +
  "only when the text does not already identify a business seller. " +
  "A clean professional photo of one car is not enough to call it a dealer. " +
  "Curbstoner: a personal profile selling several unrelated vehicles, or 'I buy cars / I have more'. " +
  "Use confidence >= 0.85 only when the evidence is unambiguous. " +
  "Return one JSON object via the tool. Reasoning must be one sentence.";

export const SELLER_CLASSIFY_TOOL = {
  name: SELLER_CLASSIFY_TOOL_NAME,
  description: "Classify the seller of this vehicle listing.",
  input_schema: {
    type: "object" as const,
    properties: {
      seller_type: {
        type: "string",
        enum: ["dealer", "private_party", "curbstoner_suspected", "unknown"],
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "0-1 confidence in seller_type. Use >= 0.85 only when the text is unambiguous.",
      },
      reasoning: {
        type: "string",
        description: "One sentence citing the listing text.",
      },
      signals: {
        type: "array",
        items: { type: "string" },
        description: "Short labels such as financing_language, business_name, stock_number, personal_seller.",
      },
    },
    required: ["seller_type", "confidence", "reasoning", "signals"],
  },
};

export function buildSellerClassifyUserPrompt(input: {
  title?: string | null;
  description?: string | null;
  sellerName?: string | null;
  imageCount?: number;
}): string {
  const imageLine =
    (input.imageCount ?? 0) > 0
      ? `Photos attached: ${input.imageCount}. Use them. A dealer lot in the photo is dealer evidence even if the text is a bare year/make/model.`
      : "Photos attached: none.";
  const lines = [
    "Classify the seller of this listing.",
    "",
    `Seller name: ${input.sellerName?.trim() || "(none)"}`,
    `Title: ${input.title?.trim() || "(none)"}`,
    `Description: ${input.description?.trim() || "(none)"}`,
    imageLine,
  ];
  return lines.join("\n");
}
