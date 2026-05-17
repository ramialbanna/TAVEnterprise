import { formatMoney } from "@/lib/format";

// Issue #44 honest-empty token. NOTE: this is two ASCII hyphens "--"
// (matches the Manheim screenshots), deliberately NOT @/lib/format's
// null sentinel which is an em-dash "—". MmrMoney/MmrRange must decide
// emptiness themselves and never rely on formatMoney's null branch.
export const DASH = "--";

export function MmrMoney({ value }: { value: number | null | undefined }) {
  // Number.isFinite (not typeof) so NaN/Infinity also fall to DASH and can
  // never reach formatMoney's em-dash branch — keeps the empty token "--".
  return <span>{Number.isFinite(value) ? formatMoney(value as number) : DASH}</span>;
}

export function MmrRange({
  low,
  high,
}: {
  low: number | null | undefined;
  high: number | null | undefined;
}) {
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return <span>{DASH}</span>;
  }
  return (
    <span>
      {formatMoney(low)} - {formatMoney(high)}
    </span>
  );
}
