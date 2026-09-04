export const STATE_PATH: string;
export const TIMEZONE: string;
export const HOUR_START: number;
export const HOUR_END: number;
export const DEFAULT_MAX_PER_HOUR: number;
export const DEFAULT_MAX_PER_DAY: number;
export const FATAL_SKIP_REASONS: Set<string>;

export class SessionHaltedError extends Error {
  reason: string;
  constructor(reason: string, message?: string);
}

export function isDeadBrowserError(err: unknown): boolean;
export function isCloudUnavailableError(err: unknown): boolean;
export function chicagoParts(date?: Date): { day: string; hour: number };
export function emptyState(): {
  haltedAt: string | null;
  haltReason: string | null;
  days: Record<string, unknown>;
};
export function loadState(filePath?: string): ReturnType<typeof emptyState>;
export function saveState(state: ReturnType<typeof emptyState>, filePath?: string): void;
export function clearHalt(state: ReturnType<typeof emptyState>): ReturnType<typeof emptyState>;
export function halt(state: ReturnType<typeof emptyState>, reason: string): ReturnType<typeof emptyState>;
export function isWithinHours(date?: Date, hourStart?: number, hourEnd?: number): boolean;
export function usageOn(
  state: ReturnType<typeof emptyState>,
  date?: Date,
): { day: string; hour: number; dayCount: number; hourCount: number };
export function remainingCapacity(
  state: ReturnType<typeof emptyState>,
  opts?: { maxPerDay?: number; maxPerHour?: number },
  date?: Date,
): number;
export function assertCanRun(
  state: ReturnType<typeof emptyState>,
  opts?: {
    skipHours?: boolean;
    maxPerDay?: number;
    maxPerHour?: number;
    hourStart?: number;
    hourEnd?: number;
  },
  date?: Date,
): number;
export function recordVisit(state: ReturnType<typeof emptyState>, date?: Date): ReturnType<typeof emptyState>;
export function jitter(minMs: number, maxMs: number): number;
