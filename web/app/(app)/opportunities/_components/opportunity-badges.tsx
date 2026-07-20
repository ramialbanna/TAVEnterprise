import type { OpportunityRow } from "@/lib/app-api/schemas";
import { Badge } from "@/components/ui/badge";
import { MetaBadgeDot } from "@/components/ui/meta-badge";

import { badgeTone, isMetaBadge } from "@/lib/opportunities/badge-style";

export function OpportunityBadges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges.map((badge) =>
        isMetaBadge(badge) ? (
          <MetaBadgeDot key={badge} label={badge} />
        ) : (
          <Badge key={badge} variant={badgeTone(badge)}>
            {badge}
          </Badge>
        ),
      )}
    </div>
  );
}

export function OpportunityTypeBadge({ row }: { row: Pick<OpportunityRow, "type" | "grade"> }) {
  if (row.type === "lead") {
    const variant =
      row.grade === "excellent" || row.grade === "good"
        ? "healthy"
        : row.grade === "fair"
          ? "review"
          : "neutral";
    return <Badge variant={variant}>Lead{row.grade ? ` · ${row.grade}` : ""}</Badge>;
  }
  if (row.type === "manual_submission") {
    return <Badge variant="healthy">Manual</Badge>;
  }
  if (row.type === "scraper_review") {
    return <Badge variant="review">Unprocessed lead</Badge>;
  }
  return <Badge variant="review">Near miss</Badge>;
}
