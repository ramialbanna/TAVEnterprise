import type { OpportunityRow } from "@/lib/app-api/schemas";
import { Badge } from "@/components/ui/badge";

import { formatOpportunityBadge, formatOpportunityType } from "@/lib/copy/opportunities-labels";

function badgeVariant(badge: string): "healthy" | "review" | "error" | "neutral" {
  if (badge === "Near miss") return "review";
  if (badge === "Scraper review" || badge === "No MMR") return "review";
  if (badge === "Manual submission") return "healthy";
  if (badge.startsWith("Estimated")) return "review";
  if (badge === "Price changed") return "neutral";
  if (badge.startsWith("Seen again")) return "neutral";
  if (badge === "Possible duplicate") return "neutral";
  if (badge === "First seen") return "healthy";
  return "neutral";
}

export function OpportunityBadgesNew({
  badges,
  compact = false,
}: {
  badges: string[];
  compact?: boolean;
}) {
  if (badges.length === 0) return compact ? null : <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <Badge
          key={badge}
          variant={badgeVariant(badge)}
          className={compact ? "px-1 py-0 text-[10px] leading-4" : undefined}
        >
          {formatOpportunityBadge(badge)}
        </Badge>
      ))}
    </div>
  );
}

export function OpportunityTypeBadgeNew({
  row,
  compact = false,
}: {
  row: Pick<OpportunityRow, "type" | "grade">;
  compact?: boolean;
}) {
  const variant =
    row.type === "lead"
      ? row.grade === "excellent" || row.grade === "good"
        ? "healthy"
        : row.grade === "fair"
          ? "review"
          : "neutral"
      : row.type === "manual_submission"
        ? "healthy"
        : row.type === "scraper_review"
          ? "review"
          : "review";

  return (
    <Badge variant={variant} className={compact ? "px-1 py-0 text-[10px] leading-4" : undefined}>
      {formatOpportunityType(row.type, row.grade)}
    </Badge>
  );
}
