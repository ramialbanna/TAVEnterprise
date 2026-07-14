import type { OpportunityRow } from "@/lib/app-api/schemas";
import { Badge } from "@/components/ui/badge";

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

export function OpportunityBadges({ badges }: { badges: string[] }) {
  if (badges.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <Badge key={badge} variant={badgeVariant(badge)}>
          {badge}
        </Badge>
      ))}
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
