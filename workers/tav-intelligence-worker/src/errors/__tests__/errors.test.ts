import { describe, it, expect } from "vitest";
import {
  ValidationError,
  AuthError,
  ExternalApiError,
  CacheLockError,
  PersistenceError,
} from "../index";

describe("IntelligenceError subclasses", () => {
  it("ValidationError carries code=validation_error / status=400", () => {
    const e = new ValidationError("nope");
    expect(e.code).toBe("validation_error");
    expect(e.httpStatus).toBe(400);
    expect(e.name).toBe("ValidationError");
  });

  it("AuthError carries code=auth_error / status=401", () => {
    const e = new AuthError("nope");
    expect(e.code).toBe("auth_error");
    expect(e.httpStatus).toBe(401);
  });

  it("ExternalApiError carries code=external_api_error / status=502", () => {
    const e = new ExternalApiError("nope");
    expect(e.code).toBe("external_api_error");
    expect(e.httpStatus).toBe(502);
  });

  it("CacheLockError carries code=cache_lock_error / status=503", () => {
    const e = new CacheLockError("nope");
    expect(e.code).toBe("cache_lock_error");
    expect(e.httpStatus).toBe(503);
  });

  it("PersistenceError carries code=persistence_error / status=503", () => {
    const e = new PersistenceError("nope");
    expect(e.code).toBe("persistence_error");
    expect(e.httpStatus).toBe(503);
  });

  it("preserves details when provided", () => {
    const e = new ValidationError("bad", { field: "vin" });
    expect(e.details).toEqual({ field: "vin" });
  });
});
