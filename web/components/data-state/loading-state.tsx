import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type LoadingVariant = "card" | "cards" | "table" | "block";

/**
 * Skeleton placeholder for a data region that is loading with nothing to show yet.
 *   - `card`   — one card-shaped skeleton.
 *   - `cards`  — `count` card skeletons in a responsive grid (KPI grids).
 *   - `table`  — a header bar + `rows` row skeletons inside a card.
 *   - `block`  — a single rounded box (`h-` set via `className`).
 */
export function LoadingState({
  variant = "card",
  count = 4,
  rows = 5,
  className,
}: {
  variant?: LoadingVariant;
  count?: number;
  rows?: number;
  className?: string;
}) {
  if (variant === "block") {
    return <Skeleton className={cn("h-24 w-full", className)} aria-hidden />;
  }

  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)} aria-hidden>
        {Array.from({ length: count }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <Card className={className} aria-hidden>
        <CardContent className="space-y-2 pt-4">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return <CardSkeleton className={className} />;
}

function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className} aria-hidden>
      <CardHeader>
        <Skeleton className="h-3.5 w-24" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}
