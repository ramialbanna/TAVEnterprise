"use client";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityListPage, OpportunityRow } from "@/lib/app-api/schemas";
import { useInterface } from "@/lib/interface/interface-provider";

import { OpportunitiesClientClassic } from "./opportunities-client-classic";
import { OpportunitiesClientNew } from "./opportunities-client-new";

export function OpportunitiesInterfaceClient({
  initialClassic,
  initialNew,
}: {
  initialClassic: ApiResult<OpportunityRow[]>;
  initialNew: ApiResult<OpportunityListPage>;
}) {
  const { interfaceMode } = useInterface();

  if (interfaceMode === "new") {
    return <OpportunitiesClientNew initial={initialNew} />;
  }

  return <OpportunitiesClientClassic initial={initialClassic} />;
}
