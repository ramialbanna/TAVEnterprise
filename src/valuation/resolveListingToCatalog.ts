/**
 * Item 55 Phase B — map listing-parsed identity onto Cox catalog tokens at
 * ingest, reusing item 46 cascade logic before MMR lookup.
 */

import { extractTitleTrim } from "./extractTitleTrim";
import { matchCatalogOption, pickCatalogOptionFuzzy } from "./matchCatalogOption";
import { selectCatalogModelVariantForListing, isCatalogModelVariantOf } from "./selectCatalogModelVariant";
import { selectCatalogStyleForListing } from "./selectCatalogStyle";
import { resolveCatalogStyleFromEvidence } from "./resolveCatalogStyleFromEvidence";

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
};

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

async function resolveModel(
  fetchCatalog: CatalogFetcher,
  args: {
    year: number;
    make: string;
    modelRaw: string;
    styleRaw: string;
    title: string;
  },
): Promise<{ model: string | null; trimEvidence: string; modelVariantAmbiguous: boolean }> {
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
    return {
      model: null,
      trimEvidence: args.styleRaw || leftoverStyleEvidence,
      modelVariantAmbiguous: variantCount > 0,
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
): Promise<IngestListingCatalogResolution> {
  const unmatched: IngestListingCatalogResolution["unmatched"] = [];
  let catalogConnected = false;

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

    const { model: matchedModel, trimEvidence, modelVariantAmbiguous } = await resolveModel(fetchCatalog, {
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
