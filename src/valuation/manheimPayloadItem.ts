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

/**
 * YMM item selection with style-name scoring (Item 17).
 *
 * Cox YMM search responses return an `items[]` array of trim variants but
 * none carry `bestMatch: true` — only VIN lookups set that flag. Without
 * scoring, we always take `items[0]` which may not match the user's selected
 * style, producing an incorrect Base MMR.
 *
 * Scoring priority (highest wins):
 *   100 — exact match on description.trim or item.trim
 *    80 — exact match on description.subSeries
 *    60 — style name starts with the item's trim string (prefix match)
 *    50 — style name starts with the item's subSeries string
 *   1–N — number of style tokens found anywhere in the item's description text
 *
 * Returns the highest-scoring item; falls back to `items[0]` when no item
 * scores above 0, or to `null` when the payload has no items array. Callers
 * should use the returned single item as the parsing payload so all downstream
 * parsers (which call `selectMmrPayloadItem` internally) pick it up as root.
 */
export function selectMmrPayloadItemByStyle(
  payload: unknown,
  styleName: string,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;

  if (!Array.isArray(record.items) || record.items.length === 0) return null;

  // VIN-style bestMatch flag takes priority even on YMM payloads.
  const flagged = record.items.find(
    (item) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).bestMatch === true,
  );
  if (flagged && typeof flagged === "object" && !Array.isArray(flagged)) {
    return flagged as Record<string, unknown>;
  }

  const normalStyle = styleName.trim().toLowerCase();

  let bestScore = 0;
  let bestItem: Record<string, unknown> | null = null;

  for (const raw of record.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const score = scoreItemAgainstStyle(item, normalStyle);
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  if (bestScore > 0 && bestItem) return bestItem;

  // Fall back to items[0].
  const first = record.items[0];
  return first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : null;
}

function scoreItemAgainstStyle(item: Record<string, unknown>, normalStyle: string): number {
  if (!normalStyle) return 0;

  const description =
    item.description && typeof item.description === "object" && !Array.isArray(item.description)
      ? (item.description as Record<string, unknown>)
      : null;

  const trimStr = lowerStr(description?.trim ?? item.trim);
  const subSeriesStr = lowerStr(description?.subSeries ?? item.subSeries);
  const fullDescStr = lowerStr(description?.description ?? item.styleDescription);

  if (trimStr && trimStr === normalStyle) return 100;
  if (subSeriesStr && subSeriesStr === normalStyle) return 80;
  // Single-word trims (e.g. "SE") must not win via prefix — that incorrectly
  // selects items[0] when many trims share the same short name (2022 Camry).
  if (trimStr && trimStr.includes(" ") && normalStyle.startsWith(trimStr)) return 60;
  if (subSeriesStr && normalStyle.startsWith(subSeriesStr)) return 50;

  // Token overlap: reward style-token coverage; penalize extra item tokens
  // (e.g. "awd") not present in the user's selected style string.
  const itemText = [trimStr, subSeriesStr, fullDescStr].filter(Boolean).join(" ");
  if (itemText) {
    const styleTokens = normalStyle.split(/\s+/).filter(Boolean);
    const matches = styleTokens.filter((t) => itemText.includes(t)).length;
    if (matches > 0) {
      const styleSet = new Set(styleTokens);
      const penalty = itemText
        .split(/\s+/)
        .filter((t) => t.length > 2 && !styleSet.has(t)).length;
      return Math.max(1, matches * 10 - penalty * 8);
    }
  }

  return 0;
}

function lowerStr(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}
