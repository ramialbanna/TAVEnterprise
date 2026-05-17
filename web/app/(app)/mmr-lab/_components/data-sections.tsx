import { Card, CardContent } from "@/components/ui/card";
import { DASH } from "./mmr-value";

// Honest-empty frames. There is no backend source for similar vehicles,
// transactions, or historical/projected averages — the lean /app/mmr/vin
// envelope returns valuation only. These render the Manheim section shells
// with -- bodies; they light up only when a real backend supplies them.

const TX_COLUMNS = [
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">
      {children}
    </h2>
  );
}

function AvgSlot({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-primary">{DASH}</div>
    </div>
  );
}

export function DataSections() {
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Similar vehicles</SectionTitle>
        <Card className="mt-2 bg-surface-sunken">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {DASH}
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionTitle>Transactions</SectionTitle>
        <Card className="mt-2">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-muted-foreground">
                <tr>
                  {TX_COLUMNS.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={TX_COLUMNS.length}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {DASH}
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <SectionTitle>Historical Average</SectionTitle>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <AvgSlot label="Past 30 Days" />
            <AvgSlot label="6 Months Ago" />
            <AvgSlot label="Last Year" />
          </div>
        </section>
        <section>
          <SectionTitle>Projected Average</SectionTitle>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <AvgSlot label="Next Month" />
          </div>
        </section>
      </div>
    </div>
  );
}
