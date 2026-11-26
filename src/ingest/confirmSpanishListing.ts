/**
 * The wordlist nominates, and a nominated ad is dropped.
 * Claude can keep it only when it is confident the ad is English.
 * A timeout, a missing key, or a low score still drops the ad.
 */
import type { Env } from "../types/env";
import { callAnthropicForSpanishListing } from "../llm/spanishListingClient";
import { matchSpanishListing, type SpanishListingMatch } from "./spanishListing";

/** Same bar as the dealer auto-reject gate. Only a confident English call keeps the car. */
export const SPANISH_LISTING_MIN_CONFIDENCE = 0.85;

export type SpanishListingDecision = {
  refuse: boolean;
  nominated: SpanishListingMatch | null;
  /** wordlist: dropped with no usable Claude answer. llm: Claude answered. */
  source?: "wordlist" | "llm";
  language?: "spanish" | "english";
  confidence?: number;
  reasoning?: string;
};

export async function confirmSpanishListing(
  input: { title?: string | null; description?: string | null },
  env: Env,
  opts?: { allowLlm?: boolean },
): Promise<SpanishListingDecision> {
  const nominated = matchSpanishListing(input);
  if (!nominated) return { refuse: false, nominated: null };
  if (opts?.allowLlm === false) return { refuse: true, nominated, source: "wordlist" };

  const call = await callAnthropicForSpanishListing({
    env,
    title: input.title,
    description: input.description,
  });
  if (call.kind !== "ok") return { refuse: true, nominated, source: "wordlist" };

  const { language, confidence, reasoning } = call.proposal;
  const keep = language === "english" && confidence >= SPANISH_LISTING_MIN_CONFIDENCE;
  return {
    refuse: !keep,
    nominated,
    source: "llm",
    language,
    confidence,
    reasoning,
  };
}
