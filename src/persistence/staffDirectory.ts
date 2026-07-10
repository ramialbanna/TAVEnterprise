import type { SupabaseClient } from "./supabase";

export type StaffDirectoryRole = "salesperson" | "appraiser" | "both";

export type StaffDirectoryEntry = {
  id: string;
  displayName: string;
  role: StaffDirectoryRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
};

export class StaffDirectoryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StaffDirectoryError";
    this.code = code;
  }
}

function mapRow(row: Record<string, unknown>): StaffDirectoryEntry {
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    role: row.role as StaffDirectoryRole,
    isActive: row.is_active === true,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deactivatedAt: (row.deactivated_at as string | null) ?? null,
  };
}

/** Active entries for a picker. `salesperson` / `appraiser` also include `both`. */
export async function listStaffDirectory(
  db: SupabaseClient,
  options?: { type?: "salesperson" | "appraiser"; includeInactive?: boolean },
): Promise<StaffDirectoryEntry[]> {
  let query = db
    .from("staff_directory")
    .select("*")
    .order("display_name", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  if (options?.type === "salesperson") {
    query = query.in("role", ["salesperson", "both"]);
  } else if (options?.type === "appraiser") {
    query = query.in("role", ["appraiser", "both"]);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function createStaffDirectoryEntry(
  db: SupabaseClient,
  input: { displayName: string; role: StaffDirectoryRole },
): Promise<StaffDirectoryEntry> {
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new StaffDirectoryError("validation_error", "Display name is required");
  }
  if (displayName.length > 128) {
    throw new StaffDirectoryError("validation_error", "Display name is too long");
  }

  const { data, error } = await db
    .from("staff_directory")
    .insert({
      display_name: displayName,
      role: input.role,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new StaffDirectoryError("duplicate_name", "That name already exists for this role");
    }
    throw error;
  }
  if (!data) throw new StaffDirectoryError("db_error", "Insert returned no row");
  return mapRow(data as Record<string, unknown>);
}

export async function deactivateStaffDirectoryEntry(
  db: SupabaseClient,
  id: string,
): Promise<StaffDirectoryEntry> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("staff_directory")
    .update({ is_active: false, deactivated_at: now })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new StaffDirectoryError("not_found", "Directory entry not found");
  }
  return mapRow(data as Record<string, unknown>);
}

export async function reactivateStaffDirectoryEntry(
  db: SupabaseClient,
  id: string,
): Promise<StaffDirectoryEntry> {
  const { data, error } = await db
    .from("staff_directory")
    .update({ is_active: true, deactivated_at: null })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new StaffDirectoryError("not_found", "Directory entry not found");
  }
  return mapRow(data as Record<string, unknown>);
}
