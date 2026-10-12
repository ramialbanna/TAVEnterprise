export const PROXY_POLL_FAST_MS: number;
export const PROXY_POLL_SLOW_MS: number;
export const PROXY_UNCHANGED_BACKOFF_MS: number;
export const DEFAULT_GOLOGIN_WORKSPACE_ID: string;

export type ProxyPollState = {
  lastRemainingGb: number | null;
  changedAtMs: number;
  intervalMs: number;
};

export function residentialBalanceFromTraffic(body: unknown): {
  usedGb: number | null;
  limitGb: number | null;
  remainingGb: number | null;
};

export function nextProxyPollState(
  prev: ProxyPollState | null,
  remainingGb: number | null,
  nowMs: number,
): ProxyPollState;

export function startProxyBalancePoller(opts: {
  db: unknown;
  token: string;
  workspaceId: string;
  logError?: (message: string) => void;
}): () => void;
