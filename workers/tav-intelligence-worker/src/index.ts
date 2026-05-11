import type { Env } from "./types/env";
import { dispatch } from "./routes";
import { errorResponse } from "./types/api";
import { generateRequestId } from "./utils/requestId";
import { log } from "./utils/logger";
import { IntelligenceError } from "./errors";

/**
 * Entry point for tav-intelligence-worker.
 *
 * Top-level responsibilities:
 *   1. Mint a per-request `requestId` and stamp it on every log line.
 *   2. Delegate to `dispatch` for routing.
 *   3. Convert thrown `IntelligenceError`s to the standard error envelope.
 *   4. Treat any other thrown value as a 500 — the underlying message is
 *      logged but NEVER leaked to the response.
 *   5. Always log `request.received` and either `request.complete` or
 *      `request.failed`.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = generateRequestId();
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    log("request.received", {
      requestId,
      method,
      pathname: url.pathname,
    });

    try {
      const response = await dispatch(request, env, requestId);
      log("request.complete", {
        requestId,
        method,
        pathname: url.pathname,
        status:   response.status,
      });
      return response;
    } catch (err) {
      if (err instanceof IntelligenceError) {
        log("request.failed", {
          requestId,
          method,
          pathname:    url.pathname,
          error_code:  err.code,
          http_status: err.httpStatus,
          message:     err.message,
        });
        return errorResponse(err.code, err.message, requestId, err.httpStatus, err.details);
      }

      // Unknown error — log details, return generic 500 (no message leakage).
      log("request.failed", {
        requestId,
        method,
        pathname:    url.pathname,
        error_code:  "internal_error",
        http_status: 500,
        message:     err instanceof Error ? err.message : String(err),
      });
      return errorResponse(
        "internal_error",
        "Unexpected error",
        requestId,
        500,
      );
    }
  },
};
