import { okResponse } from "../types/api";
import { AuthError, ValidationError } from "../errors";
import { SalesUploadBatchRequestSchema } from "../validate";
import type { HandlerArgs } from "./types";

/**
 * POST /sales/upload — historical sales CSV ingest. Phase F.1 SCAFFOLD ONLY.
 *
 * Validates the batch envelope but does NOT process rows yet. The real impl
 * lands in Phase G with batch fingerprinting + Postgres upsert.
 */
export async function handleSalesUpload(args: HandlerArgs): Promise<Response> {
  if (args.userContext.email === null) {
    throw new AuthError("Cloudflare Access identity required");
  }

  const body = await readJsonBody(args.request);
  const parsed = SalesUploadBatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid /sales/upload request body",
      parsed.error.flatten(),
    );
  }

  return okResponse(
    {
      ok:       false,
      batch_id: null,
      accepted: 0,
      rejected: 0,
      status:   "not_implemented",
    },
    args.requestId,
  );
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body is not valid JSON");
  }
}
