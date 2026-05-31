import { formatMoney } from "@/lib/format";

export type SpreadSignalTone = "positive" | "negative" | "neutral";

export type SpreadSignal = {
  text: string;
  tone: SpreadSignalTone;
  direction: "under" | "over" | "none";
};

/** Positive spread = priced below wholesale (room to make). */
export function formatSpreadSignal(spread: number | null | undefined): SpreadSignal {
  if (spread === null || spread === undefined || !Number.isFinite(spread)) {
    return { text: "—", tone: "neutral", direction: "none" };
  }

  const amount = formatMoney(Math.abs(spread));
  if (spread > 0) {
    return { text: `${amount} under`, tone: "positive", direction: "under" };
  }
  if (spread < 0) {
    return { text: `${amount} over`, tone: "negative", direction: "over" };
  }
  return { text: "At wholesale", tone: "neutral", direction: "none" };
}

export const SPREAD_TONE_CLASS: Record<SpreadSignalTone, string> = {
  positive: "text-status-healthy",
  negative: "text-status-error",
  neutral: "text-muted-foreground",
};
