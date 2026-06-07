"use client";

import type { OpportunityView } from "@/lib/app-api/client";
import type { ApiResult } from "@/lib/app-api";
import type { OpportunityListPage } from "@/lib/app-api/schemas";

import { OpportunitiesClientNew } from "./opportunities-client-new";

export function OpportunitiesInterfaceClient({
  initialNew,
  initialView,
}: {
  initialNew: ApiResult<OpportunityListPage>;
  initialView?: OpportunityView;
}) {
  return <OpportunitiesClientNew initial={initialNew} initialView={initialView} />;
}
