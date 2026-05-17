import { okResponse } from "../types/api";
import { AuthError } from "../errors";
import { ManheimHttpClient } from "../clients/manheimHttp";
import { log } from "../utils/logger";
import type { HandlerArgs } from "./types";

/**
 * GET /admin/valuations/contract-probe — Issue #45 R0 production contract
 * reconciliation.
 *
 * Read-only. Reachable only with a resolved identity (Cloudflare Access, or
 * the worker-to-worker service identity the router injects when the
 * `x-tav-service-secret` header matches `INTEL_SERVICE_SECRET`).
 *
 * The response is a redacted report only — status, endpoint family, response
 * key names, array counts, and classified error codes. The OAuth token,
 * secrets, and any licensed MMR/wholesale figure are NEVER included in the
 * body or the logs. Safe to share / paste into an issue.
 */
export async function handleValuationsContractProbe(
  args: HandlerArgs,
): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const client = new ManheimHttpClient(args.env, args.env.TAV_INTEL_KV);
  const report = await client.runContractProbe(args.requestId);

  // Redacted summary only: classifications + guidance string, no values.
  log("valuations.contract_probe.complete", {
    requestId: args.requestId,
    vendorConfigured: report.vendorConfigured,
    tokenObtained: report.tokenObtained,
    tokenClassified: report.tokenClassified,
    probeCount: report.probes.length,
    recommendation: report.recommendation,
  });

  return okResponse(report, args.requestId);
}
