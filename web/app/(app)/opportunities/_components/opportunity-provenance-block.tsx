import { formatDateTime } from "@/lib/format";
import type { OpportunityDetail } from "@/lib/app-api/schemas";

const ENTRY_METHOD_LABELS: Record<string, string> = {
  manual: "Manual submit",
  scraper: "Scraper",
  import: "Import",
};

function formatSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    facebook: "Facebook",
    craigslist: "Craigslist",
    autotrader: "Autotrader",
    cars_com: "Cars.com",
    offerup: "OfferUp",
  };
  return labels[source] ?? source;
}

function inferEntryMethod(opp: OpportunityDetail): string | null {
  if (opp.entryMethod) return opp.entryMethod;
  if (opp.type === "manual_submission") return "manual";
  if (opp.sourceRunId) return "scraper";
  return null;
}

/** Provenance line for deal detail hero (WF intake §4.3). */
export function OpportunityProvenanceBlock({ opportunity }: { opportunity: OpportunityDetail }) {
  const entryMethod = inferEntryMethod(opportunity);
  const entryLabel = entryMethod ? (ENTRY_METHOD_LABELS[entryMethod] ?? entryMethod) : null;
  const broughtBy = opportunity.submittedBy ?? (entryMethod === "scraper" ? "Auto" : null);
  const seenAt = opportunity.firstSeenAt ?? opportunity.lastSeenAt;

  const parts: string[] = [];
  if (broughtBy) parts.push(`Submitted by ${broughtBy}`);
  if (entryLabel) parts.push(entryLabel);
  if (seenAt) parts.push(formatDateTime(seenAt));

  if (parts.length === 0) return null;

  return (
    <p className="text-sm text-muted-foreground">
      {parts.join(" · ")}
      {opportunity.source ? (
        <>
          {" "}
          · {formatSourceLabel(opportunity.source)}
        </>
      ) : null}
    </p>
  );
}
