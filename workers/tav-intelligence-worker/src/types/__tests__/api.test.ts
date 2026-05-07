import { describe, it, expect } from "vitest";
import { okResponse, errorResponse } from "../api";
import type { ApiResponse } from "../api";

describe("okResponse", () => {
  it("returns 200 with Content-Type: application/json", () => {
    const res = okResponse({ hello: "world" }, "req-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("wraps payload in the standard envelope", async () => {
    const res = okResponse({ hello: "world" }, "req-1");
    const body = (await res.json()) as ApiResponse<{ hello: string }>;
    expect(body).toMatchObject({
      success:   true,
      data:      { hello: "world" },
      requestId: "req-1",
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("supports custom status codes", () => {
    const res = okResponse({}, "req-1", 201);
    expect(res.status).toBe(201);
  });
});

describe("errorResponse", () => {
  it("returns the supplied status with Content-Type: application/json", () => {
    const res = errorResponse("validation_error", "bad", "req-2", 400);
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("wraps the error in the standard envelope", async () => {
    const res = errorResponse("auth_error", "nope", "req-2", 401);
    const body = (await res.json()) as ApiResponse<never>;
    expect(body).toMatchObject({
      success:   false,
      error:     { code: "auth_error", message: "nope" },
      requestId: "req-2",
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("includes details when provided", async () => {
    const res = errorResponse("validation_error", "bad", "req-2", 400, { field: "vin" });
    const body = (await res.json()) as ApiResponse<never>;
    expect(body.error).toEqual({
      code: "validation_error",
      message: "bad",
      details: { field: "vin" },
    });
  });

  it("omits details when not provided", async () => {
    const res = errorResponse("auth_error", "nope", "req-2", 401);
    const body = (await res.json()) as ApiResponse<never>;
    expect(body.error?.details).toBeUndefined();
  });
});
