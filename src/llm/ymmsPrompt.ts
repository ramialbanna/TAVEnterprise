/**
 * Item 57 — LLM Y/M/M/S normalization: prompt + tool-schema construction.
 *
 * Pure, network-free functions so both the Worker resolver
 * (resolveListingWithLLM.ts) and the offline eval harness
 * (scripts/eval-llm-ymms.mjs) build the exact same context payload from the
 * exact same inputs. Deliberately feeds the FULL (year, make) catalog
 * subtree — not a pre-scored top-3 — see docs/LLM-YMMS-Normalization.md §5.
 */
import type { CoxCatalogTreeRow } from "../valuation/matchListingToCoxCatalog";

export type YmmsPromptListingInput = {
  year: number;
  make: string;
  model?: string | null;
  trim?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | null;
  /** Prior rules-based miss reason, if this is a re-attempt (e.g. model_variant_missing). */
  priorMissReason?: string | null;
};

export const YMMS_TOOL_NAME = "propose_cox_ymms";

/**
 * Anthropic tool ("function") definition used with `tool_choice: { type: "tool", name }`
 * to force structured JSON output. See src/llm/anthropicClient.ts.
 */
export const YMMS_TOOL = {
  name: YMMS_TOOL_NAME,
  description:
    "Propose the correct Cox catalog Y/M/M/S (model + style) for this vehicle listing. " +
    "You MUST pick model and style values that appear verbatim in the provided Cox catalog list — " +
    "never invent, combine, or paraphrase a value that is not in that list.",
  input_schema: {
    type: "object" as const,
    properties: {
      make: {
        type: "string",
        description: "Cox make token — must match the make the catalog list was fetched for.",
      },
      model: {
        type: "string",
        description: "Cox model token, chosen verbatim from the provided catalog list.",
      },
      style: {
        type: "string",
        description: "Cox style token for the chosen model, chosen verbatim from the provided catalog list.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "0-1 confidence that this exact model+style is correct given the listing evidence.",
      },
      reasoning: {
        type: "string",
        description: "One or two sentences citing the specific listing text that supports this pick.",
      },
      needsReview: {
        type: "boolean",
        description:
          "true when the listing evidence is too thin/ambiguous to confidently choose between two or " +
          "more catalog options — still fill make/model/style with your best guess, but flag it.",
      },
    },
    required: ["make", "model", "style", "confidence", "reasoning", "needsReview"],
  },
} as const;

export const YMMS_SYSTEM_PROMPT =
  "You are a vehicle-identity normalization assistant for a used-car acquisition pipeline. " +
  "Your only job is to map a scraped marketplace listing to the correct Cox Automotive catalog " +
  "model + style for a given year/make, so the pipeline can request a wholesale valuation (MMR). " +
  "You are given the FULL list of Cox models and styles that exist for this exact year+make — the " +
  "correct answer is always somewhere in that list. Never propose a model or style that is not in " +
  "the provided list. Never invent mileage, trim, or other details not present in the listing. " +
  "Always call the propose_cox_ymms tool with your answer — never respond with plain text.";

/**
 * Group + dedupe catalog rows into "Model\n  - style\n  - style" text blocks,
 * sorted deterministically (stable prompt-cache prefix; independent of DB row order).
 */
export function buildCatalogSubtreeText(rows: readonly CoxCatalogTreeRow[]): string {
  const byModel = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!byModel.has(row.model)) byModel.set(row.model, new Set());
    byModel.get(row.model)!.add(row.style);
  }

  const models = [...byModel.keys()].sort((a, b) => a.localeCompare(b));
  return models
    .map((model) => {
      const styles = [...byModel.get(model)!].sort((a, b) => a.localeCompare(b));
      return `${model}\n${styles.map((style) => `  - ${style}`).join("\n")}`;
    })
    .join("\n");
}

export function buildYmmsUserPrompt(input: YmmsPromptListingInput, rows: readonly CoxCatalogTreeRow[]): string {
  const lines: string[] = [];
  lines.push(`Year: ${input.year}`);
  lines.push(`Make (already resolved, do not change): ${input.make}`);
  if (input.model) lines.push(`Parser-guessed model (may be wrong/incomplete): ${input.model}`);
  if (input.trim) lines.push(`Parser-guessed trim (may be wrong/missing): ${input.trim}`);
  if (typeof input.price === "number") lines.push(`Listing price: $${input.price}`);
  if (input.priorMissReason) lines.push(`Why rules-based matching failed before: ${input.priorMissReason}`);
  lines.push("");
  lines.push("Listing title:");
  lines.push(input.title?.trim() || "(none)");
  lines.push("");
  lines.push("Listing description:");
  lines.push(input.description?.trim() || "(none)");
  lines.push("");
  lines.push(
    `All Cox models + styles that exist for ${input.year} ${input.make} (pick model and style verbatim from this list):`,
  );
  lines.push(buildCatalogSubtreeText(rows));
  return lines.join("\n");
}

export type YmmsProposal = {
  make: string;
  model: string;
  style: string;
  confidence: number;
  reasoning: string;
  needsReview: boolean;
};

/**
 * Deterministic gate (docs/LLM-YMMS-Normalization.md §5): the proposal must
 * exist verbatim (case-insensitive) in the exact subtree Claude was given.
 * Never trust the model's self-report of validity.
 */
export function isValidCoxPick(proposal: YmmsProposal, rows: readonly CoxCatalogTreeRow[]): boolean {
  const make = proposal.make.trim().toLowerCase();
  const model = proposal.model.trim().toLowerCase();
  const style = proposal.style.trim().toLowerCase();
  return rows.some(
    (row) =>
      row.make.toLowerCase() === make &&
      row.model.toLowerCase() === model &&
      row.style.toLowerCase() === style,
  );
}
