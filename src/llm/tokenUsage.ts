/** Anthropic Messages API usage fields persisted on tav.llm_ymms_decisions (§70). */
export type LlmYmmsTokenUsage = {
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
};

export function totalBilledInputTokens(usage: LlmYmmsTokenUsage): number {
  return usage.cacheReadInputTokens + usage.cacheCreationInputTokens + usage.uncachedInputTokens;
}
