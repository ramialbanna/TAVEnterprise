/**
 * §70 — Narrow Cox catalog rows sent to Claude for high-row-count makes.
 * Offline matching always uses the full tree; pruning applies to the LLM prompt only.
 */
import type { CoxCatalogTreeRow } from "../valuation/matchListingToCoxCatalog";

const PRUNE_MAKES = new Set(["ford", "chevrolet"]);

function normalizeModelText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogModelMatchesHint(catalogModel: string, parserModel: string, title: string): boolean {
  const catalog = normalizeModelText(catalogModel);
  const parser = normalizeModelText(parserModel);
  const titleNorm = normalizeModelText(title);
  if (!catalog) return false;

  if (parser && (catalog === parser || catalog.includes(parser) || parser.includes(catalog))) {
    return true;
  }

  if (titleNorm.includes(catalog)) return true;

  const catalogTokens = catalog.split(" ").filter((token) => token.length > 0);
  if (catalogTokens.length > 0 && catalogTokens.every((token) => titleNorm.includes(token) || parser.includes(token))) {
    return true;
  }

  return false;
}

export type PruneCatalogSubtreeInput = {
  make: string;
  model?: string | null;
  trim?: string | null;
  title?: string | null;
};

/**
 * Ford/Chevy only — keep models matching the parser hint and/or title tokens.
 * Falls back to the full subtree when nothing matches (never shrink to empty).
 */
export function pruneCatalogSubtreeForLlm(
  input: PruneCatalogSubtreeInput,
  rows: readonly CoxCatalogTreeRow[],
): CoxCatalogTreeRow[] {
  const makeNorm = input.make.trim().toLowerCase();
  if (!PRUNE_MAKES.has(makeNorm) || rows.length === 0) return [...rows];

  const parserModel = input.model?.trim() ?? "";
  const title = [input.title, input.trim].filter(Boolean).join(" ");
  const matchedModels = new Set<string>();

  for (const row of rows) {
    if (catalogModelMatchesHint(row.model, parserModel, title)) {
      matchedModels.add(row.model);
    }
  }

  if (matchedModels.size === 0) return [...rows];

  return rows.filter((row) => matchedModels.has(row.model));
}
