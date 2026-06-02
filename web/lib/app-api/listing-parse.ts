import { z } from "zod";

import { ParsedListingFieldsSchema, type ParsedListingFields } from "./schemas";
import { codeMessage } from "./missing-reason";
import type { ApiResult } from "./parse";

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function mapParseErrorEnvelope(
  status: number,
  body: Record<string, unknown>,
): Extract<ApiResult<never>, { ok: false }> {
  const error = typeof body.error === "string" ? body.error : "bad_response";
  const warnings = Array.isArray(body.warnings) ? body.warnings : undefined;
  return {
    ok: false,
    kind: status >= 500 ? "server" : "invalid",
    error,
    status,
    message: codeMessage(error),
    ...(warnings ? { issues: warnings } : {}),
  };
}

/** Parse Worker response for POST /app/opportunities/parse (ok:true or ok:false, often HTTP 200). */
export function parseParsedListingFields(status: number, json: unknown): ApiResult<ParsedListingFields> {
  if (!isObject(json)) {
    return {
      ok: false,
      kind: "invalid",
      error: "bad_response",
      status,
      message: codeMessage("bad_response"),
    };
  }
  if (json.ok === false) {
    return mapParseErrorEnvelope(status, json);
  }
  if (json.ok !== true) {
    return {
      ok: false,
      kind: "invalid",
      error: "bad_response",
      status,
      message: codeMessage("bad_response"),
    };
  }
  const parsed = ParsedListingFieldsSchema.safeParse(json.data);
  if (!parsed.success) {
    return {
      ok: false,
      kind: "invalid",
      error: "schema_mismatch",
      status,
      message: codeMessage("schema_mismatch"),
      issues: parsed.error.issues.slice(0, 5),
    };
  }
  return { ok: true, data: parsed.data, status };
}
