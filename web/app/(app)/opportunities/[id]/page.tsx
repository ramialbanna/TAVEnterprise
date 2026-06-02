import { notFound } from "next/navigation";

import { getOpportunity } from "@/lib/app-api/server";

import { OpportunityDetailInterfaceClient } from "../_components/opportunity-detail-interface-client";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getOpportunity(id);

  if (!result.ok && result.error === "not_found") {
    notFound();
  }

  return <OpportunityDetailInterfaceClient result={result} />;
}
