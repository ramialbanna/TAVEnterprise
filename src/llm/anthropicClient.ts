/**
 * Item 57 — LLM Y/M/M/S normalization: Worker-side Claude caller.
 *
 * Single structured-output completion per call — no multi-turn tool loop, no
 * agent, no model-initiated follow-up requests (see
 * docs/LLM-YMMS-Normalization.md §3 "why not an agent"). The only "tool use"
 * here is a forced tool call used purely to get well-formed JSON back.
 */
import { z } from "zod";
import type { Env } from "../types/env";
import { isConfiguredSecret } from "../types/envValidation";
import { log } from "../logging/logger";
import { YMMS_TOOL, YMMS_TOOL_NAME, YMMS_SYSTEM_PROMPT, type YmmsProposal } from "./ymmsPrompt";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 1024;

/**
 * Wall-clock budget for one Claude call. Generous relative to the intel
 * worker's 5s (structured output over a full year+make catalog subtree is
 * slower than a cache lookup) but still bounded — see the ingest batch
 * budget math in docs/LLM-YMMS-Normalization.md §6 before raising this.
 */
const TIMEOUT_MS = 15_000;

const YmmsProposalSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  style: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  needsReview: z.boolean(),
});

export type AnthropicCallResult =
  | { kind: "ok"; proposal: YmmsProposal; latencyMs: number; model: string }
  | { kind: "not_configured" }
  | { kind: "timeout" }
  | { kind: "rate_limited" }
  | { kind: "http_error"; status: number }
  | { kind: "invalid_response"; detail: string };

interface AnthropicMessageContentBlock {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicMessageResponse {
  content: AnthropicMessageContentBlock[];
  model?: string;
}

/**
 * Call the Anthropic Messages API once, forcing the propose_cox_ymms tool so
 * the response is always well-formed structured output. Never throws for
 * expected failure modes (timeout / rate limit / HTTP error / bad envelope)
 * — callers treat every non-"ok" kind as "fall back to the offline matcher".
 */
export async function callAnthropicForYmms(args: {
  env: Env;
  systemPrompt?: string;
  userPrompt: string;
}): Promise<AnthropicCallResult> {
  const { env, userPrompt } = args;

  if (!isConfiguredSecret(env.ANTHROPIC_API_KEY)) {
    return { kind: "not_configured" };
  }

  const model = env.LLM_YMMS_MODEL || "claude-sonnet-4-5";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
        system: args.systemPrompt ?? YMMS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        tools: [YMMS_TOOL],
        tool_choice: { type: "tool", name: YMMS_TOOL_NAME },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      log("llm_ymms.anthropic_timeout", { model, timeout_ms: TIMEOUT_MS });
      return { kind: "timeout" };
    }
    log("llm_ymms.anthropic_fetch_failed", {
      model,
      error: err instanceof Error ? err.name : String(err),
    });
    return { kind: "http_error", status: 0 };
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - startedAt;

  if (res.status === 429) {
    log("llm_ymms.anthropic_rate_limited", { model, latency_ms: latencyMs });
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
    log("llm_ymms.anthropic_http_error", {
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
    ? message.content.find((block) => block.type === "tool_use" && block.name === YMMS_TOOL_NAME)
    : undefined;

  if (!toolUseBlock) {
    log("llm_ymms.anthropic_no_tool_use", { model, latency_ms: latencyMs });
    return { kind: "invalid_response", detail: "no propose_cox_ymms tool_use block in response" };
  }

  const parsed = YmmsProposalSchema.safeParse(toolUseBlock.input);
  if (!parsed.success) {
    log("llm_ymms.anthropic_schema_invalid", {
      model,
      latency_ms: latencyMs,
      issues: parsed.error.issues.slice(0, 5),
    });
    return { kind: "invalid_response", detail: "tool_use input failed schema validation" };
  }

  return {
    kind: "ok",
    proposal: parsed.data,
    latencyMs,
    model: message.model ?? model,
  };
}
