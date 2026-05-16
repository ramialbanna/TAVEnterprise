import { describe, it, expect } from "vitest";
import { constantTimeEqual, verifyBearer } from "../bearerAuth";

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("s3cret-token", "s3cret-token")).toBe(true);
  });

  it("returns false for same-length but different strings", () => {
    expect(constantTimeEqual("aaaaaa", "aaaaab")).toBe(false);
  });

  it("returns false for different-length strings", () => {
    expect(constantTimeEqual("short", "muchlonger")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

function reqWith(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("Authorization", authHeader);
  return new Request("https://example.com/app/system-status", { headers });
}

describe("verifyBearer", () => {
  const SECRET = "configured-bearer-value";

  it("accepts a correct Bearer token", () => {
    expect(verifyBearer(reqWith(`Bearer ${SECRET}`), SECRET)).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(verifyBearer(reqWith("Bearer not-it"), SECRET)).toBe(false);
  });

  it("rejects a missing Authorization header", () => {
    expect(verifyBearer(reqWith(undefined), SECRET)).toBe(false);
  });

  it("rejects a non-Bearer scheme even if the value matches", () => {
    expect(verifyBearer(reqWith(`Basic ${SECRET}`), SECRET)).toBe(false);
  });

  it("rejects when the secret is an unconfigured placeholder", () => {
    expect(verifyBearer(reqWith("Bearer replace_me"), "replace_me")).toBe(false);
  });

  it("rejects when the secret is empty", () => {
    expect(verifyBearer(reqWith("Bearer "), "")).toBe(false);
  });

  it("rejects when the secret is not a string", () => {
    expect(verifyBearer(reqWith("Bearer x"), undefined)).toBe(false);
  });
});
