/**
 * Item 71 — cheap Haiku call for seller-type classification.
 * Failures never throw: callers fail open and ingest the listing.
 */
import { z } from "zod";
import type { Env } from "../types/env";
import { isConfiguredSecret } from "../types/envValidation";
import { log } from "../logging/logger";
import { selectSellerClassifyImageUrls } from "../apify/listingMedia";
import {
  SELLER_CLASSIFY_SYSTEM_PROMPT,
  SELLER_CLASSIFY_TOOL,
  SELLER_CLASSIFY_TOOL_NAME,
  buildSellerClassifyUserPrompt,
  type SellerClassifyProposal,
} from "./sellerClassifyPrompt";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 256;
/** Vision + tool JSON. Ingest skips the call when less than this remains on the batch clock. */
export const SELLER_CLASSIFY_TIMEOUT_MS = 8_000;

type SellerClassifyContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } };

function buildSellerClassifyUserContent(args: {
  title?: string | null;
  description?: string | null;
  sellerName?: string | null;
  imageUrls?: string[] | null;
}): SellerClassifyContentBlock[] {
  const imageUrls = selectSellerClassifyImageUrls(args.imageUrls);
  const blocks: SellerClassifyContentBlock[] = imageUrls.map((url) => ({
    type: "image",
    source: { type: "url", url },
  }));
  blocks.push({
    type: "text",
    text: buildSellerClassifyUserPrompt({
      title: args.title,
      description: args.description,
      sellerName: args.sellerName,
      imageCount: imageUrls.length,
    }),
  });
  return blocks;
}

const ProposalSchema = z.object({
  seller_type: z.enum(["dealer", "private_party", "curbstoner_suspected", "unknown"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  signals: z.array(z.string()),
});

export type SellerClassifyCallResult =
  | {
      kind: "ok";
      proposal: SellerClassifyProposal;
      latencyMs: number;
      model: string;
    }
  | { kind: "not_configured" }
  | { kind: "timeout" }
  | { kind: "rate_limited" }
  | { kind: "http_error"; status: number }
  | { kind: "invalid_response"; detail: string };

interface AnthropicMessageContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

interface AnthropicMessageResponse {
  content: AnthropicMessageContentBlock[];
  model?: string;
}

export async function callAnthropicForSellerClassify(args: {
  env: Env;
  title?: string | null;
  description?: string | null;
  sellerName?: string | null;
  imageUrls?: string[] | null;
}): Promise<SellerClassifyCallResult> {
  const { env } = args;
  if (!isConfiguredSecret(env.ANTHROPIC_API_KEY)) {
    return { kind: "not_configured" };
  }

  const model = env.SELLER_CLASSIFY_MODEL || "claude-haiku-4-5";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SELLER_CLASSIFY_TIMEOUT_MS);
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: SELLER_CLASSIFY_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildSellerClassifyUserContent(args),
          },
        ],
        tools: [SELLER_CLASSIFY_TOOL],
        tool_choice: { type: "tool", name: SELLER_CLASSIFY_TOOL_NAME },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      log("ingest.seller_classify_timeout", { model, timeout_ms: SELLER_CLASSIFY_TIMEOUT_MS });
      return { kind: "timeout" };
    }
    log("ingest.seller_classify_fetch_failed", {
      model,
      error: err instanceof Error ? err.name : String(err),
    });
    return { kind: "http_error", status: 0 };
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - startedAt;

  if (res.status === 429) {
    log("ingest.seller_classify_rate_limited", { model, latency_ms: latencyMs });
    return { kind: "rate_limited" };
  }
  if (!res.ok) {
    log("ingest.seller_classify_http_error", { model, status: res.status, latency_ms: latencyMs });
    return { kind: "http_error", status: res.status };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { kind: "invalid_response", detail: "response body was not valid JSON" };
  }

  const message = data as AnthropicMessageResponse;
  const toolUseBlock = Array.isArray(message.content)
    ? message.content.find((block) => block.type === "tool_use" && block.name === SELLER_CLASSIFY_TOOL_NAME)
    : undefined;
  if (!toolUseBlock) {
    return { kind: "invalid_response", detail: "no classify_listing_seller tool_use block" };
  }

  const parsed = ProposalSchema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    return { kind: "invalid_response", detail: "tool_use input failed schema validation" };
  }

  return {
    kind: "ok",
    proposal: parsed.data,
    latencyMs,
    model: message.model ?? model,
  };
}
