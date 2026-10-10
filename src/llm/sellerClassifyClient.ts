/**
 * Item 71 — cheap Haiku call for seller-type classification.
 * Failures never throw: callers fail open and ingest the listing.
 */
import { z } from "zod";
import type { Env } from "../types/env";
import { isConfiguredSecret } from "../types/envValidation";
import { log } from "../logging/logger";
import { selectSellerClassifyImageUrls } from "../apify/listingMedia";
import { fetchImageAsBase64, type InlineImageSource } from "./inlineImage";
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
/** Photo download share of the budget; the Anthropic call gets the rest. */
const SELLER_CLASSIFY_IMAGE_TIMEOUT_MS = 2_500;

type SellerClassifyContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: InlineImageSource };

/**
 * Photos are downloaded here and sent as base64. Anthropic cannot fetch
 * Facebook CDN links itself (robots.txt), so a URL source returns 400.
 * A photo that fails to download is dropped and the call goes text-only.
 */
async function buildSellerClassifyUserContent(
  args: {
    title?: string | null;
    description?: string | null;
    sellerName?: string | null;
    imageUrls?: string[] | null;
  },
  model: string,
): Promise<SellerClassifyContentBlock[]> {
  const imageUrls = selectSellerClassifyImageUrls(args.imageUrls);
  const downloads = await Promise.all(
    imageUrls.map((url) => fetchImageAsBase64(url, SELLER_CLASSIFY_IMAGE_TIMEOUT_MS)),
  );
  const blocks: SellerClassifyContentBlock[] = [];
  for (const download of downloads) {
    if (download.ok) {
      blocks.push({ type: "image", source: download.source });
    } else {
      log("ingest.seller_classify_image_unavailable", { model, reason: download.reason });
    }
  }
  blocks.push({
    type: "text",
    text: buildSellerClassifyUserPrompt({
      title: args.title,
      description: args.description,
      sellerName: args.sellerName,
      imageCount: blocks.length,
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
  const startedAt = Date.now();
  const content = await buildSellerClassifyUserContent(args, model);
  // The photo download already spent part of the budget; the total stays within SELLER_CLASSIFY_TIMEOUT_MS.
  const remainingMs = Math.max(1, SELLER_CLASSIFY_TIMEOUT_MS - (Date.now() - startedAt));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remainingMs);

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
            content,
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
    let responseText = "";
    try {
      responseText = await res.text();
      if (responseText.length > 500) responseText = responseText.slice(0, 500) + "...[truncated]";
    } catch {
      /* body unreadable */
    }
    log("ingest.seller_classify_http_error", {
      model,
      status: res.status,
      latency_ms: latencyMs,
      response_text: responseText,
    });
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
