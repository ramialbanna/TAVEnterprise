"use client";

import type { OpportunityView } from "@/lib/app-api/client";

import { OpportunitiesClientNew } from "./opportunities-client-new";

export function OpportunitiesInterfaceClient({
  initialView,
}: {
  initialView?: OpportunityView;
}) {
  return <OpportunitiesClientNew initialView={initialView} />;
}
