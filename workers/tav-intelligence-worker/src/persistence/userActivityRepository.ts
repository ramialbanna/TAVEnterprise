import type { SupabaseClient } from "./supabase";
import { PersistenceError } from "../errors";
import type { UserContext } from "../auth/userContext";
import type { ActivityType } from "../validate";

export interface UserActivityInsertArgs {
  userContext:      UserContext;
  vin?:             string;
  year?:            number;
  make?:            string;
  model?:           string;
  activityType:     ActivityType;
  activityPayload?: Record<string, unknown>;
  /** ISO timestamp — set for presence semantics; absent for permanent feed entries. */
  activeUntil?:     string;
}

export interface UserActivityRepository {
  insert(args: UserActivityInsertArgs): Promise<void>;
}

export function createUserActivityRepository(
  client: SupabaseClient,
): UserActivityRepository {
  return {
    async insert(args) {
      const { error } = await client.from("user_activity").insert({
        user_id:          args.userContext.userId,
        user_name:        args.userContext.name,
        user_email:       args.userContext.email,
        vin:              args.vin             ?? null,
        year:             args.year            ?? null,
        make:             args.make            ?? null,
        model:            args.model           ?? null,
        activity_type:    args.activityType,
        activity_payload: args.activityPayload ?? {},
        active_until:     args.activeUntil     ?? null,
      });
      if (error) {
        throw new PersistenceError("user_activity insert failed", {
          code:    error.code,
          message: error.message,
        });
      }
    },
  };
}
