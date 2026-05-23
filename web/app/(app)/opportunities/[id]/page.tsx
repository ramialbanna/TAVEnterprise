import Link from "next/link";
import { notFound } from "next/navigation";

import { getOpportunity } from "@/lib/app-api/server";
import { formatNumber, formatMoney, formatDateTime } from "@/lib/format";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { OpportunityBadges, OpportunityTypeBadge } from "../_components/opportunity-badges";
import { OpportunityWorkflowPanel } from "../_components/opportunity-workflow-panel";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getOpportunity(id);

  if (!result.ok) {
    if (result.error === "not_found") notFound();
    return (
      <Card>
        <CardContent className="pt-6">
          {result.kind === "unavailable" ? (
            <UnavailableState code={result.error} title="Opportunity unavailable" />
          ) : (
            <ErrorState error={result} />
          )}
        </CardContent>
      </Card>
    );
  }

  const opp = result.data;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/opportunities" className="text-xs text-primary underline underline-offset-2">
          ← Back to queue
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{opp.title}</h1>
        <p className="text-sm text-muted-foreground">
          {[opp.year, opp.make, opp.model, opp.style].filter(Boolean).join(" ")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <OpportunityTypeBadge row={opp} />
          <OpportunityBadges badges={opp.badges} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Valuation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="Asking price" value={formatMoney(opp.price)} />
            <DetailRow label="MMR" value={formatMoney(opp.mmrValue)} />
            <DetailRow label="Spread vs MMR" value={formatMoney(opp.spread)} />
            <DetailRow label="Score" value={formatNumber(opp.finalScore)} />
            <DetailRow label="Grade" value={opp.grade ?? "—"} />
            <DetailRow label="Status" value={opp.status ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="VIN" value={opp.vin ?? "—"} />
            <DetailRow label="Mileage" value={formatNumber(opp.mileage)} />
            <DetailRow label="Region" value={opp.region ?? "—"} />
            <DetailRow label="Source" value={opp.source} />
            <DetailRow label="Seen count" value={formatNumber(opp.seenCount)} />
            <DetailRow label="Candidate listings" value={formatNumber(opp.candidateListingCount)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Sighting
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow label="First seen" value={formatDateTime(opp.firstSeenAt)} />
            <DetailRow label="Last seen" value={formatDateTime(opp.lastSeenAt)} />
            <DetailRow label="Source run" value={opp.sourceRunId ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Signals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <DetailRow
              label="Estimated mileage"
              value={opp.estimateFlags.mileage ? "Yes" : "No"}
            />
            <DetailRow
              label="Estimated style"
              value={opp.estimateFlags.style ? "Yes" : "No"}
            />
            <DetailRow label="Estimated MMR" value={opp.estimateFlags.mmr ? "Yes" : "No"} />
            <DetailRow
              label="Reason codes"
              value={opp.reasonCodes.length > 0 ? opp.reasonCodes.join(", ") : "—"}
            />
            <DetailRow
              label="Valuation miss"
              value={opp.valuationMissingReason ?? "—"}
            />
          </CardContent>
        </Card>
      </div>

      <OpportunityWorkflowPanel opportunity={opp} recordEvaluation />

      {opp.listingUrl ? (
        <a
          href={opp.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-primary underline underline-offset-2"
        >
          Open source listing
        </a>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
