/**
 * Item 55 Phase B — map listing-parsed identity onto Cox catalog tokens at
 * ingest, reusing item 46 cascade logic before MMR lookup.
 */

import { extractTitleTrim } from "./extractTitleTrim";
import { matchCatalogOption, pickCatalogOptionFuzzy } from "./matchCatalogOption";
import {
  selectCatalogModelVariantForListing,
  isCatalogModelVariantOf,
  listCatalogModelVariants,
} from "./selectCatalogModelVariant";
import { selectCatalogStyleForListing, rankCatalogStylesForListing } from "./selectCatalogStyle";
import { resolveCatalogStyleFromEvidence } from "./resolveCatalogStyleFromEvidence";
import { matchListingToCoxCatalog, type CoxCatalogTreeRow } from "./matchListingToCoxCatalog";
import type { MmrStyleAlias } from "../persistence/mmrStyleAliases";

export type CatalogFetchResult = {
  catalogState: "connected" | "not_connected";
  items: string[];
};

export type CatalogFetcher = (
  path: string,
  eventLabel: string,
) => Promise<CatalogFetchResult | null>;

export type IngestListingCatalogInput = {
  year: number;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  title?: string | null;
};

export type CatalogMatchSuggestion = {
  make: string;
  model: string;
  style: string | null;
  score: number;
  estimatedVariant: boolean;
  estimatedStyle: boolean;
};

export type IngestListingCatalogResolution = {
  make: string | null;
  model: string | null;
  /** Cox catalog style token sent as YMM `trim` / bodyname. */
  style: string | null;
  styleEstimated: boolean;
  unmatched: Array<"make" | "model" | "style">;
  catalogConnected: boolean;
  /** True when Cox splits the source model but listing evidence cannot choose. */
  modelVariantAmbiguous: boolean;
  /** True when a Cox model variant was inferred via style scoring (item 55 Phase C-a.3). */
  variantEstimated?: boolean;
  /** Top Cox paths when variant/style evidence is partial (item 55 Phase C-a.3). */
  catalogMatchSuggestions?: CatalogMatchSuggestion[];
};

const AUTO_PICK_MIN_STYLE_SCORE = 6;

export type IngestCatalogOfflineDeps = {
  lookupStyleAlias?: (aliasKey: string) => Promise<MmrStyleAlias | null>;
  loadTreeRows?: (year: number, make: string) => Promise<CoxCatalogTreeRow[]>;
  hasTreeForYear?: (year: number) => Promise<boolean>;
};

async function tryOfflineIngestCatalogResolution(
  input: IngestListingCatalogInput,
  deps: IngestCatalogOfflineDeps | undefined,
): Promise<IngestListingCatalogResolution | null> {
  if (!deps) return null;

  const makeRaw = input.make?.trim() ?? "";
  const modelRaw = input.model?.trim() ?? "";
  const styleRaw = input.trim?.trim() ?? "";
  const title = input.title?.trim() ?? "";
  if (!makeRaw || !modelRaw) return null;

  const aliasKey = [makeRaw, modelRaw, styleRaw].map((part) => part.toLowerCase()).join("|");
  if (deps.lookupStyleAlias) {
    const alias = await deps.lookupStyleAlias(aliasKey);
    if (alias) {
      return {
        make: alias.canonicalMake,
        model: alias.canonicalModel,
        style: alias.canonicalStyle,
        styleEstimated: false,
        unmatched: [],
        catalogConnected: true,
        modelVariantAmbiguous: false,
      };
    }
  }

  if (!deps.hasTreeForYear || !deps.loadTreeRows) return null;
  const hasTree = await deps.hasTreeForYear(input.year);
  if (!hasTree) return null;

  const treeRows = await deps.loadTreeRows(input.year, makeRaw);
  if (treeRows.length === 0) return null;

  const offline = matchListingToCoxCatalog(
    { year: input.year, make: makeRaw, model: modelRaw, trim: styleRaw, title },
    treeRows,
  );
  if (!offline) return null;

  if (offline.autoLookup && offline.make && offline.model && offline.style) {
    return {
      make: offline.make,
      model: offline.model,
      style: offline.style,
      styleEstimated: offline.styleEstimated,
      unmatched: [],
      catalogConnected: true,
      modelVariantAmbiguous: false,
      variantEstimated: offline.variantEstimated,
      catalogMatchSuggestions: offline.suggestions,
    };
  }

  if (offline.suggestions.length > 0) {
    return {
      make: offline.make,
      model: offline.model,
      style: offline.style,
      styleEstimated: offline.styleEstimated,
      unmatched: offline.make ? [] : ["model", "style"],
      catalogConnected: true,
      modelVariantAmbiguous: !offline.make,
      variantEstimated: offline.variantEstimated,
      catalogMatchSuggestions: offline.suggestions,
    };
  }

  return null;
}

function catalogMakesPath(year: number): string {
  return `/catalog/years/${encodeURIComponent(String(year))}/makes`;
}

function catalogModelsPath(year: number, make: string): string {
  return `/catalog/years/${encodeURIComponent(String(year))}/makes/${encodeURIComponent(make)}/models`;
}

function catalogStylesPath(year: number, make: string, model: string): string {
  return (
    `/catalog/years/${encodeURIComponent(String(year))}` +
    `/makes/${encodeURIComponent(make)}` +
    `/models/${encodeURIComponent(model)}/styles`
  );
}

function leftoverModelTokens(modelRaw: string, matchedModel: string): string {
  const rawParts = modelRaw.toLowerCase().split(/\s+/).filter(Boolean);
  const modelParts = matchedModel.toLowerCase().split(/\s+/).filter(Boolean);
  return rawParts.filter((part) => !modelParts.includes(part)).join(" ");
}

type ModelResolution = {
  model: string | null;
  trimEvidence: string;
  modelVariantAmbiguous: boolean;
  preResolvedStyle?: string | null;
  variantEstimated?: boolean;
  styleEstimated?: boolean;
  catalogMatchSuggestions?: CatalogMatchSuggestion[];
};

async function resolveAmbiguousModelVariants(
  fetchCatalog: CatalogFetcher,
  args: {
    year: number;
    make: string;
    modelRaw: string;
    styleRaw: string;
    title: string;
    variants: readonly string[];
  },
): Promise<ModelResolution> {
  const trimEvidence = args.styleRaw || extractTitleTrim(args.title) || "";
  const candidates: Array<{
    model: string;
    style: string | null;
    score: number;
    styleEstimated: boolean;
  }> = [];

  for (const variantModel of args.variants) {
    const stylesRes = await fetchCatalog(
      catalogStylesPath(args.year, args.make, variantModel),
      "styles",
    );
    if (stylesRes?.catalogState !== "connected" || stylesRes.items.length === 0) {
      candidates.push({ model: variantModel, style: null, score: 0, styleEstimated: true });
      continue;
    }

    const ranked = rankCatalogStylesForListing({
      styles: stylesRes.items,
      title: args.title,
      trim: trimEvidence || args.styleRaw || null,
    });

    if (ranked.length === 0) {
      candidates.push({
        model: variantModel,
        style: stylesRes.items[0] ?? null,
        score: 0,
        styleEstimated: true,
      });
      continue;
    }

    const [best] = ranked;
    candidates.push({
      model: variantModel,
      style: best!.style,
      score: best!.score,
      styleEstimated: best!.score < AUTO_PICK_MIN_STYLE_SCORE,
    });
  }

  const suggestions: CatalogMatchSuggestion[] = candidates
    .map((candidate) => ({
      make: args.make,
      model: candidate.model,
      style: candidate.style,
      score: candidate.score,
      estimatedVariant: true,
      estimatedStyle: candidate.styleEstimated || candidate.style === null,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const scored = candidates
    .filter((candidate) => candidate.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.styleEstimated) - Number(b.styleEstimated),
    );

  if (scored.length === 0) {
    return {
      model: null,
      trimEvidence,
      modelVariantAmbiguous: true,
      catalogMatchSuggestions: suggestions,
    };
  }

  const [best, second] = scored;
  if (
    best &&
    best.score >= AUTO_PICK_MIN_STYLE_SCORE &&
    (!second || best.score > second.score)
  ) {
    return {
      model: best.model,
      trimEvidence,
      modelVariantAmbiguous: false,
      preResolvedStyle: best.style,
      variantEstimated: true,
      styleEstimated: best.styleEstimated,
      catalogMatchSuggestions: suggestions,
    };
  }

  return {
    model: null,
    trimEvidence,
    modelVariantAmbiguous: true,
    catalogMatchSuggestions: suggestions,
  };
}

async function resolveModel(
  fetchCatalog: CatalogFetcher,
  args: {
    year: number;
    make: string;
    modelRaw: string;
    styleRaw: string;
    title: string;
  },
): Promise<ModelResolution> {
  const modelsRes = await fetchCatalog(
    catalogModelsPath(args.year, args.make),
    "models",
  );
  if (modelsRes?.catalogState !== "connected" || modelsRes.items.length === 0) {
    return { model: null, trimEvidence: args.styleRaw, modelVariantAmbiguous: false };
  }

  const models = modelsRes.items;
  const variantCount = models.filter((m) => isCatalogModelVariantOf(args.modelRaw, m)).length;

  let matchedModel = matchCatalogOption(models, args.modelRaw);

  if (!matchedModel) {
    const variant = selectCatalogModelVariantForListing({
      models,
      sourceModel: args.modelRaw,
      title: args.title,
      trim: args.styleRaw || null,
    });
    if (variant) matchedModel = variant.model;
  }

  // Fuzzy/contains only when Cox does not split the source into drivetrain variants.
  if (!matchedModel && variantCount <= 1) {
    matchedModel = pickCatalogOptionFuzzy(models, args.modelRaw);
  }

  let leftoverStyleEvidence = "";

  if (matchedModel && !matchCatalogOption(models, args.modelRaw)) {
    leftoverStyleEvidence = leftoverModelTokens(args.modelRaw, matchedModel);
  }

  if (!matchedModel) {
    const parts = args.modelRaw.split(/\s+/).filter(Boolean);
    while (!matchedModel && parts.length > 1) {
      const stripped = parts.pop()!;
      leftoverStyleEvidence = [stripped, leftoverStyleEvidence].filter(Boolean).join(" ");
      const candidate = parts.join(" ");
      matchedModel = pickCatalogOptionFuzzy(models, candidate);
      if (!matchedModel) {
        const variant = selectCatalogModelVariantForListing({
          models,
          sourceModel: candidate,
          title: args.title,
          trim: args.styleRaw || leftoverStyleEvidence || null,
        });
        if (variant) matchedModel = variant.model;
      }
    }
  }

  if (!matchedModel) {
    const variants = listCatalogModelVariants(models, args.modelRaw);
    if (variants.length > 0) {
      return resolveAmbiguousModelVariants(fetchCatalog, {
        year: args.year,
        make: args.make,
        modelRaw: args.modelRaw,
        styleRaw: args.styleRaw,
        title: args.title,
        variants,
      });
    }
    return {
      model: null,
      trimEvidence: args.styleRaw || leftoverStyleEvidence,
      modelVariantAmbiguous: false,
    };
  }

  if (!leftoverStyleEvidence) {
    leftoverStyleEvidence = leftoverModelTokens(args.modelRaw, matchedModel);
  }

  const trimEvidence =
    args.styleRaw || leftoverStyleEvidence || extractTitleTrim(args.title) || "";

  return { model: matchedModel, trimEvidence, modelVariantAmbiguous: false };
}

/**
 * Resolve listing identity to Cox catalog tokens before ingest MMR lookup.
 * Mirrors item 46 detail-page cascade; uses live catalog APIs from intel worker.
 */
export async function resolveListingToCatalogForIngest(
  input: IngestListingCatalogInput,
  fetchCatalog: CatalogFetcher,
  offlineDeps?: IngestCatalogOfflineDeps,
): Promise<IngestListingCatalogResolution> {
  const unmatched: IngestListingCatalogResolution["unmatched"] = [];

  const makeRaw = input.make?.trim() ?? "";
  const modelRaw = input.model?.trim() ?? "";
  const styleRaw = input.trim?.trim() ?? "";
  const title = input.title?.trim() ?? "";

  if (!makeRaw) {
    return {
      make: null,
      model: null,
      style: null,
      styleEstimated: false,
      unmatched: ["make", "model", "style"],
      catalogConnected: false,
      modelVariantAmbiguous: false,
    };
  }

  const offlineResolved = await tryOfflineIngestCatalogResolution(input, offlineDeps);
  if (offlineResolved?.make && offlineResolved.model && offlineResolved.style) {
    return offlineResolved;
  }

  let catalogConnected = false;

  const makesRes = await fetchCatalog(catalogMakesPath(input.year), "makes");
  if (makesRes?.catalogState === "connected") {
    catalogConnected = true;
    const matchedMake = pickCatalogOptionFuzzy(makesRes.items, makeRaw);
    if (!matchedMake) {
      return {
        make: null,
        model: null,
        style: null,
        styleEstimated: false,
        unmatched: ["make", "model", "style"],
        catalogConnected,
        modelVariantAmbiguous: false,
      };
    }

    if (!modelRaw) {
      return {
        make: matchedMake,
        model: null,
        style: null,
        styleEstimated: false,
        unmatched: ["model", "style"],
        catalogConnected,
        modelVariantAmbiguous: false,
      };
    }

    const {
      model: matchedModel,
      trimEvidence,
      modelVariantAmbiguous,
      preResolvedStyle,
      variantEstimated,
      styleEstimated,
      catalogMatchSuggestions,
    } = await resolveModel(fetchCatalog, {
      year: input.year,
      make: matchedMake,
      modelRaw,
      styleRaw,
      title,
    });

    if (!matchedModel) {
      return {
        make: matchedMake,
        model: null,
        style: null,
        styleEstimated: false,
        unmatched: ["model", "style"],
        catalogConnected,
        modelVariantAmbiguous,
        catalogMatchSuggestions,
      };
    }

    if (preResolvedStyle) {
      return {
        make: matchedMake,
        model: matchedModel,
        style: preResolvedStyle,
        styleEstimated: styleEstimated ?? true,
        unmatched,
        catalogConnected,
        modelVariantAmbiguous: false,
        variantEstimated,
        catalogMatchSuggestions,
      };
    }

    const stylesRes = await fetchCatalog(
      catalogStylesPath(input.year, matchedMake, matchedModel),
      "styles",
    );
    if (stylesRes?.catalogState !== "connected" || stylesRes.items.length === 0) {
      return {
        make: matchedMake,
        model: matchedModel,
        style: null,
        styleEstimated: false,
        unmatched: ["style"],
        catalogConnected,
        modelVariantAmbiguous: false,
      };
    }

    const exactStyle = matchCatalogOption(stylesRes.items, trimEvidence);
    if (exactStyle) {
      return {
        make: matchedMake,
        model: matchedModel,
        style: exactStyle,
        styleEstimated: false,
        unmatched,
        catalogConnected,
        modelVariantAmbiguous: false,
      };
    }

    if (title) {
      const titleSelected = selectCatalogStyleForListing({
        styles: stylesRes.items,
        title,
        trim: trimEvidence || styleRaw || null,
      });
      if (titleSelected && !titleSelected.isEstimated) {
        return {
          make: matchedMake,
          model: matchedModel,
          style: titleSelected.style,
          styleEstimated: false,
          unmatched,
          catalogConnected,
          modelVariantAmbiguous: false,
        };
      }
    }

    const evidenceStyle = resolveCatalogStyleFromEvidence(stylesRes.items, trimEvidence);
    if (evidenceStyle) {
      const evidenceTrim = trimEvidence.trim();
      const hasStrongEvidence =
        evidenceTrim.length > 0 &&
        !evidenceStyle.isEstimated &&
        stylesRes.items.some(
          (style) => style.toLowerCase() === evidenceTrim.toLowerCase(),
        );
      const hasTokenEvidence =
        evidenceTrim.length > 0 &&
        stylesRes.items.some((style) => {
          const token = evidenceTrim.toUpperCase();
          const normalized = style.toUpperCase();
          return new RegExp(`(?:^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(
            normalized,
          );
        });
      if (hasStrongEvidence || hasTokenEvidence) {
        return {
          make: matchedMake,
          model: matchedModel,
          style: evidenceStyle.style,
          styleEstimated: evidenceStyle.isEstimated,
          unmatched,
          catalogConnected,
          modelVariantAmbiguous: false,
        };
      }
    }

    const selected = selectCatalogStyleForListing({
      styles: stylesRes.items,
      title,
      trim: trimEvidence || styleRaw || null,
    });
    if (!selected) {
      if (evidenceStyle) {
        return {
          make: matchedMake,
          model: matchedModel,
          style: evidenceStyle.style,
          styleEstimated: true,
          unmatched,
          catalogConnected,
          modelVariantAmbiguous: false,
        };
      }
      unmatched.push("style");
      return {
        make: matchedMake,
        model: matchedModel,
        style: null,
        styleEstimated: false,
        unmatched,
        catalogConnected,
        modelVariantAmbiguous: false,
      };
    }

    return {
      make: matchedMake,
      model: matchedModel,
      style: selected.style,
      styleEstimated: selected.isEstimated,
      unmatched,
      catalogConnected,
      modelVariantAmbiguous: false,
    };
  }

  return {
    make: null,
    model: null,
    style: null,
    styleEstimated: false,
    unmatched: ["make", "model", "style"],
    catalogConnected,
    modelVariantAmbiguous: false,
  };
}
