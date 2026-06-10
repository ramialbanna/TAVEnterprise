import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { DASH } from "./mmr-value";
import type { MmrLowerSectionState } from "./mmr-lower-section-state";

export const TX_COLUMNS = [
  "Date",
  "Price",
  "Odo (mi)",
  "Grade",
  "EVBH",
  "Eng/T",
  "Ext Color",
  "Type",
  "Region",
  "Auction",
] as const;

type Props = {
  state: MmrLowerSectionState;
  className?: string;
};

function SectionTitle() {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
      Transactions
    </h2>
  );
}

function IdleBody() {
  return (
    <Card className="mt-2 border-dashed bg-surface-sunken">
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        Search to load wholesale auction transaction comps for this vehicle.
      </CardContent>
    </Card>
  );
}

function LoadingBody() {
  return (
    <Card className="mt-2">
      <CardContent className="space-y-2 p-4">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyBody() {
  return (
    <Card className="mt-2">
      <CardContent className="p-0">
        <p className="px-4 py-2 text-xs text-muted-foreground sm:hidden">
          Swipe horizontally to see all transaction columns.
        </p>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <table className="min-w-[56rem] w-full text-sm">
            <thead className="bg-surface-sunken text-muted-foreground">
              <tr>
                {TX_COLUMNS.map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 3 }).map((_, row) => (
                <tr key={row} className="border-t border-border">
                  {TX_COLUMNS.map((c) => (
                    <td key={c} className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                      {DASH}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Cox wholesale auction comps are not wired yet — placeholders only until Phase 4
          (`MANHEIM_INCLUDE_HISTORICAL` + transaction parse).
        </p>
      </CardContent>
    </Card>
  );
}

/** Zone C2 — Cox-style wholesale transaction comps table. */
export function TransactionsTable({ state, className }: Props) {
  return (
    <section className={cn("min-w-0 px-4 sm:px-6", className)} aria-busy={state === "loading"}>
      <SectionTitle />
      {state === "idle" ? <IdleBody /> : null}
      {state === "loading" ? <LoadingBody /> : null}
      {state === "empty" ? <EmptyBody /> : null}
    </section>
  );
}
