import type { Env } from "../types/env";
import type { UserContext } from "../auth/userContext";

/**
 * Standard arg bag passed to every handler. The router builds this once per
 * request (after extracting user context) and forwards it.
 */
export interface HandlerArgs {
  request:     Request;
  env:         Env;
  requestId:   string;
  userContext: UserContext;
  /** Path params extracted from dynamic route segments (e.g. `:vin`). */
  pathParams?: Record<string, string>;
}
