/**
 * Item 72 — recover VINs sellers typed into the listing body.
 *
 * ~82 listings/day carry a full 17-character VIN in the description while
 * `normalized_listings.vin` sits at 0% populated, because both adapters only
 * looked at a structured `vin` field that Facebook and Craigslist never send.
 * A VIN is the only identity source that is never a guess: it decodes to one
 * exact Cox style, skips the catalog cascade entirely, and is exempt from the
 * valuation year floor.
 *
 * Because a wrong VIN prices a different car — the one outcome worse than no
 * price — every candidate must clear three gates: the ISO 3779 charset, the
 * NHTSA check digit, and (when both are known) agreement with the listing year.
 * Text containing two different valid VINs is discarded rather than guessed at.
 */

/** ISO 3779 excludes I, O and Q so they cannot be confused with 1 and 0. */
const VIN_CHARSET = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * 17 valid VIN characters not adjoined by another alphanumeric, so a longer
 * token (a stock number, a URL fragment) cannot yield a false 17-char window.
 */
const VIN_CANDIDATE = /(?<![A-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Z0-9])/g;

/** NHTSA check-digit transliteration. Absent letters (I, O, Q) are invalid anyway. */
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const CHECK_DIGIT_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Model-year codes for the 2010–2039 cycle. The letters repeat every 30 years,
 * but our inventory floor is 2011 so this window is unambiguous.
 */
const MODEL_YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

/**
 * NHTSA check digit (position 9). Mandatory on every North American vehicle
 * since 1981, so a candidate that fails it is not a VIN for a car we can book.
 * Rejects roughly 10 of every 11 random 17-character strings.
 */
export function hasValidVinCheckDigit(vin: string): boolean {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const char = vin[i]!;
    const value = char >= "0" && char <= "9" ? Number(char) : TRANSLITERATION[char];
    if (value === undefined) return false;
    sum += value * CHECK_DIGIT_WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return vin[8] === expected;
}

export function isValidVin(candidate: string): boolean {
  const vin = candidate.trim().toUpperCase();
  return VIN_CHARSET.test(vin) && hasValidVinCheckDigit(vin);
}

/** Model year encoded at position 10, or null when the code is not in our cycle. */
export function vinModelYear(vin: string): number | null {
  const index = MODEL_YEAR_CODES.indexOf(vin[9] ?? "");
  return index === -1 ? null : 2010 + index;
}

/**
 * A VIN's model year may legitimately run one ahead of how a seller describes
 * the car, so only a wider gap is treated as evidence we picked up the wrong
 * string — a VIN quoted for a different vehicle, or a coincidental match.
 */
function yearsAgree(vin: string, listingYear: number | undefined): boolean {
  if (listingYear === undefined) return true;
  const encoded = vinModelYear(vin);
  if (encoded === null) return true;
  return Math.abs(encoded - listingYear) <= 1;
}

/**
 * First trustworthy VIN in free text, or undefined.
 *
 * Returns undefined when the text holds two different valid VINs: that is a
 * multi-vehicle post (or a dealer inventory dump), and picking one would be a
 * coin flip on which car we price.
 */
export function findVinInText(
  text: string | undefined | null,
  listingYear?: number,
): string | undefined {
  if (!text) return undefined;

  const found = new Set<string>();
  for (const match of text.toUpperCase().matchAll(VIN_CANDIDATE)) {
    const vin = match[0];
    if (hasValidVinCheckDigit(vin) && yearsAgree(vin, listingYear)) found.add(vin);
  }

  if (found.size !== 1) return undefined;
  return [...found][0];
}

/**
 * VIN for a listing: a structured field when the source provides one, else the
 * listing text. Structured fields win because they were not inferred.
 */
export function resolveListingVin(input: {
  structured?: string | undefined;
  description?: string | undefined | null;
  title?: string | undefined | null;
  year?: number | undefined;
}): string | undefined {
  if (input.structured) {
    const vin = input.structured.trim().toUpperCase();
    if (VIN_CHARSET.test(vin)) return vin;
  }
  return (
    findVinInText(input.description, input.year) ?? findVinInText(input.title, input.year)
  );
}
