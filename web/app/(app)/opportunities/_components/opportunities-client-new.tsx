"use client";

import type { ApiResult } from "@/lib/app-api";
import type { OpportunityRow } from "@/lib/app-api/schemas";

import { OpportunitiesClientClassic } from "./opportunities-client-classic";

/** New-mode stub — fork from Classic until Phase 2+ UX lands. */
export function OpportunitiesClientNew({
  initial,
}: {
  initial: ApiResult<OpportunityRow[]>;
}) {
  return <OpportunitiesClientClassic initial={initial} />;
}
