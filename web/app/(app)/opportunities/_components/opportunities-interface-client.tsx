"use client";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityRow } from "@/lib/app-api/schemas";
import { useInterface } from "@/lib/interface/interface-provider";

import { OpportunitiesClientClassic } from "./opportunities-client-classic";
import { OpportunitiesClientNew } from "./opportunities-client-new";

export function OpportunitiesInterfaceClient({
  initial,
}: {
  initial: ApiResult<OpportunityRow[]>;
}) {
  const { interfaceMode } = useInterface();

  if (interfaceMode === "new") {
    return <OpportunitiesClientNew initial={initial} />;
  }

  return <OpportunitiesClientClassic initial={initial} />;
}
