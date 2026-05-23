import type { SupabaseClient } from "./supabase";

export type UserRole = "admin" | "closer" | "viewer";

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppUserSummary {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

function mapUser(row: Record<string, unknown>): AppUser {
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    role: row.role as UserRole,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapUserSummary(row: Record<string, unknown>): AppUserSummary {
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    role: row.role as UserRole,
  };
}

/**
 * Resolve an active user by email, auto-provisioning on first sight.
 * Updates display_name when the Auth.js session name changes.
 */
export async function getOrCreateUserByEmail(
  db: SupabaseClient,
  input: { email: string; displayName?: string | null },
): Promise<AppUser> {
  const email = input.email.trim().toLowerCase();
  const displayName = (input.displayName?.trim() || email).slice(0, 256);

  const { data: existing, error: selectErr } = await db
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (selectErr) throw selectErr;

  if (existing) {
    const row = existing as Record<string, unknown>;
    if (!row.is_active) {
      throw new UserInactiveError(email);
    }
    if (row.display_name !== displayName) {
      const { data: updated, error: updateErr } = await db
        .from("users")
        .update({ display_name: displayName })
        .eq("id", row.id as string)
        .select("*")
        .single();
      if (updateErr) throw updateErr;
      if (!updated) throw new Error("getOrCreateUserByEmail: update returned no row");
      return mapUser(updated as Record<string, unknown>);
    }
    return mapUser(row);
  }

  const { data: inserted, error: insertErr } = await db
    .from("users")
    .insert({
      email,
      display_name: displayName,
      role: "closer",
      is_active: true,
    })
    .select("*")
    .single();

  if (insertErr) throw insertErr;
  if (!inserted) throw new Error("getOrCreateUserByEmail: insert returned no row");
  return mapUser(inserted as Record<string, unknown>);
}

export async function listActiveUsers(db: SupabaseClient): Promise<AppUserSummary[]> {
  const { data, error } = await db
    .from("users")
    .select("id, email, display_name, role")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => mapUserSummary(row as Record<string, unknown>));
}

export async function getActiveUserById(
  db: SupabaseClient,
  userId: string,
): Promise<AppUserSummary | null> {
  const { data, error } = await db
    .from("users")
    .select("id, email, display_name, role")
    .eq("id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapUserSummary(data as Record<string, unknown>);
}

export class UserInactiveError extends Error {
  readonly code = "user_inactive" as const;

  constructor(email: string) {
    super(`User is inactive: ${email}`);
    this.name = "UserInactiveError";
  }
}
