"use client";

import { PAGE_COPY } from "@/lib/copy/opportunities-labels";

export function OpportunitiesPageIntro() {
  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight">{PAGE_COPY.title}</h1>
      <p className="text-sm text-muted-foreground">{PAGE_COPY.intro}</p>
    </header>
  );
}
