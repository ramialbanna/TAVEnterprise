/**
 * Text-only Haiku call: is this ad written in Spanish?
 * Failures never throw. Callers keep the listing when this is not "ok".
 */
import { z } from "zod";
import type { Env } from "../types/env";
import { isConfiguredSecret } from "../types/envValidation";
import { log } from "../logging/logger";
import {
  SPANISH_LISTING_SYSTEM_PROMPT,
  SPANISH_LISTING_TOOL,
  SPANISH_LISTING_TOOL_NAME,
  buildSpanishListingUserPrompt,
  type SpanishListingProposal,
} from "./spanishListingPrompt";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 128;
export const SPANISH_LISTING_TIMEOUT_MS = 4_000;

const ProposalSchema = z.object({
  language: z.enum(["spanish", "english"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type SpanishListingCallResult =
  | { kind: "ok"; proposal: SpanishListingProposal; latencyMs: number; model: string }
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

export async function callAnthropicForSpanishListing(args: {
  env: Env;
  title?: string | null;
  description?: string | null;
}): Promise<SpanishListingCallResult> {
  const { env } = args;
  if (!isConfiguredSecret(env.ANTHROPIC_API_KEY)) {
    return { kind: "not_configured" };
  }

  const model = env.SELLER_CLASSIFY_MODEL || env.LLM_YMMS_MODEL || "claude-haiku-4-5";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPANISH_LISTING_TIMEOUT_MS);
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
        system: SPANISH_LISTING_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildSpanishListingUserPrompt(args),
          },
        ],
        tools: [SPANISH_LISTING_TOOL],
        tool_choice: { type: "tool", name: SPANISH_LISTING_TOOL_NAME },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      log("ingest.spanish_listing_timeout", { model, timeout_ms: SPANISH_LISTING_TIMEOUT_MS });
      return { kind: "timeout" };
    }
    log("ingest.spanish_listing_fetch_failed", {
      model,
      error: err instanceof Error ? err.name : String(err),
    });
    return { kind: "http_error", status: 0 };
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - startedAt;

  if (res.status === 429) {
    log("ingest.spanish_listing_rate_limited", { model, latency_ms: latencyMs });
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
    log("ingest.spanish_listing_http_error", {
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
    ? message.content.find((block) => block.type === "tool_use" && block.name === SPANISH_LISTING_TOOL_NAME)
    : undefined;
  if (!toolUseBlock) {
    return { kind: "invalid_response", detail: "no classify_listing_language tool_use block" };
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
