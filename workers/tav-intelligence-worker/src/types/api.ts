/**
 * Standard API response envelope and helpers for building JSON Responses.
 *
 * Every response from this Worker — success or error — flows through one of
 * `okResponse` / `errorResponse`. Handlers MUST NOT construct `Response`
 * directly; the envelope shape is part of the public contract.
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
  timestamp: string;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** Build a successful JSON response with the standard envelope. */
export function okResponse<T>(data: T, requestId: string, status = 200): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Build an error JSON response with the standard envelope. */
export function errorResponse(
  code: string,
  message: string,
  requestId: string,
  status: number,
  details?: unknown,
): Response {
  const body: ApiResponse<never> = {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
    requestId,
    timestamp: new Date().toISOString(),
  };
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
