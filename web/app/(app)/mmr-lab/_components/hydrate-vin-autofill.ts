import {
  getMmrCatalogMakes,
  getMmrCatalogModels,
  getMmrCatalogStyles,
} from "@/lib/app-api/client";
import type { MmrVinOk } from "@/lib/app-api/schemas";

import { resolveCatalogStyle } from "./resolve-catalog-style";
import type { MmrCatalogOptions, MmrSelection } from "./search-panel";

export type StyleMatchKind = "exact" | "approximate" | "none";

export type VinAutofillResult = {
  selection: MmrSelection;
  catalog: Pick<MmrCatalogOptions, "years" | "makes" | "models" | "styles">;
  styleMatch: StyleMatchKind;
  coxTrim: string | null;
};

function pickCatalogOption(options: string[], raw: string | null): string | null {
  if (!raw || options.length === 0) return null;
  const exact = options.find((option) => option === raw);
  if (exact) return exact;
  const lower = raw.toLowerCase();
  const caseInsensitive = options.find((option) => option.toLowerCase() === lower);
  if (caseInsensitive) return caseInsensitive;
  const contains = options.find(
    (option) =>
      option.toLowerCase().includes(lower) || lower.includes(option.toLowerCase()),
  );
  return contains ?? null;
}

/** Map Cox vehicle identity from a VIN lookup into catalog-backed YMM selection. */
export async function hydrateVinAutofill(
  result: MmrVinOk,
  catalogYears: string[],
  mileage: string,
): Promise<VinAutofillResult | null> {
  const { year, make, model, trim } = result;
  if (year === null || year === undefined || !make || !model) return null;

  const yearStr = String(year);
  if (!catalogYears.includes(yearStr)) return null;

  const makesRes = await getMmrCatalogMakes(yearStr);
  if (!makesRes.ok) return null;
  const makeResolved = pickCatalogOption(makesRes.data.items, make);
  if (!makeResolved) return null;

  const modelsRes = await getMmrCatalogModels(yearStr, makeResolved);
  if (!modelsRes.ok) return null;
  const modelResolved = pickCatalogOption(modelsRes.data.items, model);
  if (!modelResolved) return null;

  const stylesRes = await getMmrCatalogStyles(yearStr, makeResolved, modelResolved);
  if (!stylesRes.ok) return null;

  const styleResolved = resolveCatalogStyle(stylesRes.data.items, trim);
  const styleMatch: StyleMatchKind = styleResolved?.isEstimated
    ? "approximate"
    : styleResolved
      ? "exact"
      : "none";

  return {
    selection: {
      year: yearStr,
      make: makeResolved,
      model: modelResolved,
      style: styleResolved?.style ?? "",
      mileage,
    },
    catalog: {
      years: catalogYears,
      makes: makesRes.data.items,
      models: modelsRes.data.items,
      styles: stylesRes.data.items,
    },
    styleMatch,
    coxTrim: trim ?? null,
  };
}

export function styleMatchNotice(
  kind: StyleMatchKind,
  coxTrim: string | null,
): string | null {
  if (kind !== "approximate") return null;
  if (coxTrim) {
    return `Style approximated — Cox trim “${coxTrim}” did not match the catalog exactly.`;
  }
  return "Style approximated — Cox trim did not match the catalog exactly.";
}
