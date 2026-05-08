/**
 * Deterministic SHA-256 fingerprint for dedup during outcome import.
 * Input: weekLabel + VIN (or YMM composite) + buyerId.
 * The caller is responsible for constructing a stable vehicleKey.
 *
 * Uses the Web Crypto API (available in Cloudflare Workers and Node 18+).
 */
export async function computeImportFingerprint(
  weekLabel: string,
  vehicleKey: string, // VIN if available, else "YYYY:make:model:mileage_bucket"
  buyerId: string,
  // pricePaid is intentional: the same vehicle re-uploaded at a different price is a distinct purchase event.
  pricePaid: number,
): Promise<string> {
  const input = `${weekLabel}|${vehicleKey.toUpperCase()}|${buyerId.toLowerCase()}|${pricePaid}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
