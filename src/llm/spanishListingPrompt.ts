/**
 * Language check for ads the Spanish wordlist nominated.
 * The wordlist false-positives English leads (Del Rio, troca, hablo español).
 * Claude reads the whole ad and only a Spanish-language listing is refused.
 */

export type SpanishListingProposal = {
  language: "spanish" | "english";
  confidence: number;
  reasoning: string;
};

export const SPANISH_LISTING_TOOL_NAME = "classify_listing_language";

export const SPANISH_LISTING_SYSTEM_PROMPT =
  "You decide whether a used-car Marketplace ad is written in Spanish. " +
  "Texas Auto Value keeps English ads. Refuse only when a buyer has to read Spanish to understand the car. " +
  "Keep the ad when it is English, even if it contains a Spanish word or a short Spanish line. " +
  "These do not make an ad Spanish: Del Rio, Del Valle, El Paso, LA, air con, troca, troka, carro, " +
  "or a line like hablo español. " +
  "A Spanish translation under a complete English description is still English. " +
  "A name is not evidence. " +
  "Use confidence >= 0.85 only when the language is obvious. " +
  "Return one JSON object via the tool. Reasoning must be one sentence.";

export const SPANISH_LISTING_TOOL = {
  name: SPANISH_LISTING_TOOL_NAME,
  description: "Decide whether this vehicle listing is written in Spanish or English.",
  input_schema: {
    type: "object" as const,
    properties: {
      language: {
        type: "string",
        enum: ["spanish", "english"],
        description: "spanish only when the ad itself is in Spanish. english when the ad is in English.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
      reasoning: {
        type: "string",
        description: "One sentence citing the listing text.",
      },
    },
    required: ["language", "confidence", "reasoning"],
  },
};

const MAX_TEXT_CHARS = 2_000;

function clip(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length <= MAX_TEXT_CHARS) return trimmed;
  return trimmed.slice(0, MAX_TEXT_CHARS);
}

export function buildSpanishListingUserPrompt(input: {
  title?: string | null;
  description?: string | null;
}): string {
  return [
    "Is this listing written in Spanish?",
    "",
    `Title: ${clip(input.title) || "(none)"}`,
    `Description: ${clip(input.description) || "(none)"}`,
  ].join("\n");
}
