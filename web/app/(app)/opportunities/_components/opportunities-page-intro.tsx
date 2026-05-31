"use client";

import { PAGE_COPY } from "@/lib/copy/opportunities-labels";
import { useInterface } from "@/lib/interface/interface-provider";

const CLASSIC_COPY = {
  title: "Opportunities",
  intro:
    "Review scored leads, near-miss listings, and finder submissions in one queue. " +
    "Compare asking price to MMR, scan event badges, submit listing links, then claim, " +
    "update status, and add notes.",
} as const;

export function OpportunitiesPageIntro() {
  const { interfaceMode } = useInterface();
  const copy = interfaceMode === "new" ? PAGE_COPY : CLASSIC_COPY;

  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="text-sm text-muted-foreground">{copy.intro}</p>
    </header>
  );
}
