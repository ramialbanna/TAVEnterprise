import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Responsive grid for `KpiCard`s — 1 column on phones, 2 on small screens, 3 on large,
 * 4 on extra-large. Layout only; takes the cards as children.
 */
export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}
