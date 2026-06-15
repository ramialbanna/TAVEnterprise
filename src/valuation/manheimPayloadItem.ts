/**
 * Select the Cox/Manheim MMR payload item to parse.
 *
 * VIN lookups return multiple trim variants in `items[]`. Cox flags the
 * VIN-decoded trim with `bestMatch: true` (Manheim MMR tool parity).
 * Fall back to `items[0]`, then the root object when no array is present.
 */
export function selectMmrPayloadItem(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;

  if (Array.isArray(record.items) && record.items.length > 0) {
    const best = record.items.find(
      (item) =>
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        (item as Record<string, unknown>).bestMatch === true,
    );
    const chosen = best ?? record.items[0];
    if (chosen && typeof chosen === "object" && !Array.isArray(chosen)) {
      return chosen as Record<string, unknown>;
    }
    return null;
  }

  return record;
}
