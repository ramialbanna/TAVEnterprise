import type { OpportunityRow } from "@/lib/app-api/schemas";
import { Badge } from "@/components/ui/badge";
import { MetaBadgeDot } from "@/components/ui/meta-badge";

import { formatOpportunityBadge, formatOpportunityType } from "@/lib/copy/opportunities-labels";
import { badgeTone, isMetaBadge } from "@/lib/opportunities/badge-style";

export function OpportunityBadgesNew({
  badges,
  compact = false,
}: {
  badges: string[];
  compact?: boolean;
}) {
  if (badges.length === 0) return compact ? null : <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges.map((badge) =>
        isMetaBadge(badge) ? (
          <MetaBadgeDot key={badge} label={formatOpportunityBadge(badge)} compact={compact} />
        ) : (
          <Badge
            key={badge}
            variant={badgeTone(badge)}
            className={compact ? "px-1 py-0 text-[10px] leading-4" : undefined}
          >
            {formatOpportunityBadge(badge)}
          </Badge>
        ),
      )}
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
