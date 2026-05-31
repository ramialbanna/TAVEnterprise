"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { listOpportunities } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { OpportunityRow } from "@/lib/app-api/schemas";
import { queryKeys } from "@/lib/query";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { OpportunitiesTable } from "./opportunities-table";
import { OpportunityPreviewSheet } from "./opportunity-preview-sheet";
import { ManualSubmitDialog } from "./manual-submit-dialog";

const LIST_LIMIT = 50;

export function OpportunitiesClientClassic({
  initial,
}: {
  initial: ApiResult<OpportunityRow[]>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<OpportunityRow | null>(null);

  const query = useQuery({
    queryKey: queryKeys.opportunities({ limit: LIST_LIMIT }),
    queryFn: () => listOpportunities({ limit: LIST_LIMIT }),
    initialData: initial,
  });

  const result = query.data;

  if (result === undefined) {
    return <p className="text-sm text-muted-foreground">Loading opportunities…</p>;
  }

  if (!result.ok) {
    return (
      <Card>
        <CardContent className="pt-6">
          {result.kind === "unavailable" ? (
            <UnavailableState code={result.error} title="Opportunities unavailable" />
          ) : (
            <ErrorState error={result} onRetry={() => void query.refetch()} />
          )}
        </CardContent>
      </Card>
    );
  }

  const rows = result.data;
  const leads = rows.filter((r) => r.type === "lead").length;
  const nearMisses = rows.filter((r) => r.type === "near_miss").length;
  const manual = rows.filter((r) => r.type === "manual_submission").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ManualSubmitDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Queue summary
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
          <span>Total shown: {rows.length}</span>
          <span>Leads: {leads}</span>
          <span>Near misses: {nearMisses}</span>
          <span>Manual: {manual}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Opportunities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OpportunitiesTable
            rows={rows}
            loading={query.isLoading}
            onSelect={(row) => setSelected(row)}
            onOpenDetail={(row) => router.push(`/opportunities/${row.id}`)}
            emptyTitle="No opportunities yet"
            emptyHint="Leads, near-miss listings, and manual submissions appear here. Submit a listing link with the button above."
          />
          <p className="pt-3 text-xs text-muted-foreground">
            Click a row for a quick preview. Double-click or use the preview link for the
            full detail page. Admins can assign closers; closers can claim opportunities for
            a 24-hour working window.
          </p>
        </CardContent>
      </Card>

      <OpportunityPreviewSheet row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
