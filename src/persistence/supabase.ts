import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types/env";

type SupabaseEnv = Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">;

export function getSupabaseClient(env: SupabaseEnv) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: "tav",
    },
  });
}

export type SupabaseClient = ReturnType<typeof getSupabaseClient>;
