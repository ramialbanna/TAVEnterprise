/**
 * Select Cox catalog model variants (e.g. CR-V → CR-V AWD) when drivetrain
 * evidence appears in the listing title/trim. Port of
 * `src/valuation/selectCatalogModelVariant.ts` for the web app (item 46).
 */

export type CatalogModelVariantSelectionInput = {
  models: readonly string[];
  sourceModel: string;
  title?: string | null;
  trim?: string | null;
};

export type CatalogModelVariantSelection = {
  model: string;
  matchedSignals: string[];
};

const DRIVETRAIN_SIGNALS: ReadonlyArray<{ signal: string; aliases: readonly string[] }> = [
  { signal: "AWD", aliases: ["AWD", "ALL WHEEL DRIVE", "ALL-WHEEL DRIVE"] },
  { signal: "FWD", aliases: ["FWD", "FRONT WHEEL DRIVE", "FRONT-WHEEL DRIVE"] },
  { signal: "RWD", aliases: ["RWD", "REAR WHEEL DRIVE", "REAR-WHEEL DRIVE"] },
  { signal: "4WD", aliases: ["4WD", "4X4", "FOUR WHEEL DRIVE", "FOUR-WHEEL DRIVE"] },
  { signal: "2WD", aliases: ["2WD", "4X2", "TWO WHEEL DRIVE", "TWO-WHEEL DRIVE"] },
];

function normalizeToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(
    haystack,
  );
}

function collectDrivetrainSignals(title?: string | null, trim?: string | null): string[] {
  const evidence = normalizeToken([title, trim].filter(Boolean).join(" "));
  if (!evidence) return [];

  const signals: string[] = [];
  for (const entry of DRIVETRAIN_SIGNALS) {
    if (entry.aliases.some((alias) => hasPhrase(evidence, normalizeToken(alias)))) {
      signals.push(entry.signal);
    }
  }
  return signals;
}

export function isCatalogModelVariantOf(sourceModel: string, catalogModel: string): boolean {
  const source = normalizeToken(sourceModel);
  const candidate = normalizeToken(catalogModel);
  return source.length > 0 && (candidate === source || candidate.startsWith(`${source} `));
}

export function selectCatalogModelVariantForListing(
  input: CatalogModelVariantSelectionInput,
): CatalogModelVariantSelection | null {
  const variants = input.models.filter((model) =>
    isCatalogModelVariantOf(input.sourceModel, model),
  );
  if (variants.length === 0) return null;

  const exact = variants.find(
    (model) => normalizeToken(model) === normalizeToken(input.sourceModel),
  );
  if (exact) return { model: exact, matchedSignals: ["EXACT_MODEL"] };

  const signals = collectDrivetrainSignals(input.title, input.trim);
  if (signals.length === 0) return null;

  const scored = variants
    .map((model) => {
      const normalized = normalizeToken(model);
      const matched = signals.filter((signal) => hasPhrase(normalized, signal));
      return { model, matched };
    })
    .filter((row) => row.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length);

  if (scored.length === 0) return null;
  const [best, second] = scored;
  if (!best) return null;
  if (second && second.matched.length === best.matched.length) return null;
  return { model: best.model, matchedSignals: best.matched };
}
