import type { SupabaseClient } from "../../persistence/supabase";
import {
  MAXBUY_DEFAULT_TARGET_NET_GROSS,
  MAXBUY_POLICY_VERSION,
} from "../constants";

export async function getCurrentTargetNetGross(
  db: SupabaseClient,
): Promise<{ targetNetGross: number; policyVersion: string }> {
  const { data, error } = await db
    .from("maxbuy_policy")
    .select("target_net_gross, policy_version")
    .eq("scope", "global")
    .is("effective_to", null)
    .maybeSingle();

  if (error) throw error;

  return {
    targetNetGross: data?.target_net_gross != null
      ? Number(data.target_net_gross)
      : MAXBUY_DEFAULT_TARGET_NET_GROSS,
    policyVersion: data?.policy_version ?? MAXBUY_POLICY_VERSION,
  };
}
