import { dispatchMaxbuy } from "./routes";
import type { MaxbuyWorkerEnv } from "../../../src/maxbuy/types/env";
import { log, serializeError } from "../../../src/logging/logger";

export default {
  async fetch(request: Request, env: MaxbuyWorkerEnv): Promise<Response> {
    try {
      return await dispatchMaxbuy(request, env);
    } catch (err) {
      log("maxbuy_worker.error", serializeError(err));
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ ok: false, error: "internal_error", message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
