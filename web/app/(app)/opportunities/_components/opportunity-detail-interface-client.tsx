"use client";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityDetail } from "@/lib/app-api/schemas";
import { useInterface } from "@/lib/interface/interface-provider";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent } from "@/components/ui/card";

import { OpportunityDetailClientNew } from "./opportunity-detail-client-new";
import { OpportunityWorkflowPanel } from "./opportunity-workflow-panel";
import { OpportunityBadges, OpportunityTypeBadge } from "./opportunity-badges";
import { formatMoney, formatNumber, formatDateTime } from "@/lib/format";
import Link from "next/link";

function ClassicDetail({ opp }: { opp: OpportunityDetail }) {
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
          <CardContent className="space-y-2 pt-6 text-sm">
            <DetailRow label="Asking price" value={formatMoney(opp.price)} />
            <DetailRow label="MMR" value={formatMoney(opp.mmrValue)} />
            <DetailRow label="Spread vs MMR" value={formatMoney(opp.spread)} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 pt-6 text-sm">
            <DetailRow label="VIN" value={opp.vin ?? "—"} />
            <DetailRow label="Mileage" value={formatNumber(opp.mileage)} />
            <DetailRow label="First seen" value={formatDateTime(opp.firstSeenAt)} />
          </CardContent>
        </Card>
      </div>

      <OpportunityWorkflowPanel
        opportunity={opp}
        actions={opp.actions}
        recordEvaluation
        showActionHistory
      />

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

export function OpportunityDetailInterfaceClient({
  result,
}: {
  result: ApiResult<OpportunityDetail>;
}) {
  const { interfaceMode } = useInterface();

  if (!result.ok) {
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

  if (interfaceMode === "new") {
    return <OpportunityDetailClientNew initial={result.data} />;
  }

  return <ClassicDetail opp={result.data} />;
}
