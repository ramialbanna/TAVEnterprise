import type { OpportunitySort } from "@/lib/app-api/client";

export type TableColumnId =
  | "vehicle"
  | "price"
  | "mmrValue"
  | "spread"
  | "finalScore"
  | "assignedCloserName"
  | "claimedBy"
  | "status"
  | "region"
  | "lastSeenAt"
  | "actions";

export type TableDensity = "comfortable" | "compact";

export const DEFAULT_PAGE_SIZE = 25;

export const PAGE_SIZE_OPTIONS = [25, 50] as const;

export const SORT_OPTIONS: readonly { value: OpportunitySort; label: string }[] = [
  { value: "spread_desc", label: "Room to make (best first)" },
  { value: "score_desc", label: "Deal score (highest first)" },
  { value: "last_seen_desc", label: "Last seen (newest first)" },
];

export const TABLE_COLUMNS: readonly {
  id: TableColumnId;
  label: string;
  defaultVisible: boolean;
  hideable: boolean;
}[] = [
  { id: "vehicle", label: "Vehicle", defaultVisible: true, hideable: false },
  { id: "price", label: "Asking price", defaultVisible: true, hideable: true },
  { id: "mmrValue", label: "Wholesale value", defaultVisible: true, hideable: true },
  { id: "spread", label: "Room to make", defaultVisible: true, hideable: true },
  { id: "finalScore", label: "Deal score", defaultVisible: true, hideable: true },
  { id: "assignedCloserName", label: "Assignee", defaultVisible: true, hideable: true },
  { id: "claimedBy", label: "Working by", defaultVisible: true, hideable: true },
  { id: "status", label: "Status", defaultVisible: true, hideable: true },
  { id: "region", label: "Region", defaultVisible: false, hideable: true },
  { id: "lastSeenAt", label: "Last seen", defaultVisible: false, hideable: true },
  { id: "actions", label: "Actions", defaultVisible: true, hideable: false },
];

const COLUMN_STORAGE_KEY = "tav.opportunities.new.columns";
const DENSITY_STORAGE_KEY = "tav.opportunities.new.density";

export function defaultColumnVisibility(): Record<TableColumnId, boolean> {
  return Object.fromEntries(TABLE_COLUMNS.map((col) => [col.id, col.defaultVisible])) as Record<
    TableColumnId,
    boolean
  >;
}

export function readColumnVisibility(): Record<TableColumnId, boolean> {
  if (typeof window === "undefined") return defaultColumnVisibility();
  try {
    const raw = window.localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaultColumnVisibility();
    const parsed = JSON.parse(raw) as Partial<Record<TableColumnId, boolean>>;
    const defaults = defaultColumnVisibility();
    for (const col of TABLE_COLUMNS) {
      if (typeof parsed[col.id] === "boolean") {
        defaults[col.id] = parsed[col.id]!;
      }
    }
    defaults.vehicle = true;
    defaults.actions = true;
    return defaults;
  } catch {
    return defaultColumnVisibility();
  }
}

export function writeColumnVisibility(visibility: Record<TableColumnId, boolean>): void {
  window.localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(visibility));
}

export function readTableDensity(): TableDensity {
  if (typeof window === "undefined") return "compact";
  const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
  return stored === "comfortable" ? "comfortable" : "compact";
}

export function writeTableDensity(density: TableDensity): void {
  window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
}
