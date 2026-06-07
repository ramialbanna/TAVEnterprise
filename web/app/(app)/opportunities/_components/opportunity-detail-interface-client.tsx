"use client";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityDetail } from "@/lib/app-api/schemas";
import { ErrorState, UnavailableState } from "@/components/data-state";
import { Card, CardContent } from "@/components/ui/card";

import { OpportunityDetailClientNew } from "./opportunity-detail-client-new";

export function OpportunityDetailInterfaceClient({
  result,
}: {
  result: ApiResult<OpportunityDetail>;
}) {
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

  return <OpportunityDetailClientNew initial={result.data} />;
}
