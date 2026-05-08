import { describe, it, expect } from "vitest";
import { extractUserContext, canForceRefresh } from "../userContext";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/", { headers });
}

describe("extractUserContext", () => {
  it("returns all-null context when no Cloudflare Access headers are present", () => {
    const ctx = extractUserContext(makeRequest());
    expect(ctx).toEqual({ userId: null, email: null, name: null, roles: [] });
  });

  it("reads email from Cf-Access-Authenticated-User-Email", () => {
    const ctx = extractUserContext(makeRequest({
      "Cf-Access-Authenticated-User-Email": "alice@texasautovalue.com",
    }));
    expect(ctx.email).toBe("alice@texasautovalue.com");
    expect(ctx.userId).toBe("alice@texasautovalue.com"); // mirrors email today
  });

  it("reads name when present", () => {
    const ctx = extractUserContext(makeRequest({
      "Cf-Access-Authenticated-User-Email": "alice@texasautovalue.com",
      "Cf-Access-Authenticated-User-Name": "Alice Adams",
    }));
    expect(ctx.name).toBe("Alice Adams");
  });

  it("parses roles from Cf-Access-Authenticated-User-Roles (comma-separated)", () => {
    const ctx = extractUserContext(makeRequest({
      "Cf-Access-Authenticated-User-Email": "alice@texasautovalue.com",
      "Cf-Access-Authenticated-User-Roles": "manager, buyer , analyst",
    }));
    expect(ctx.roles).toEqual(["manager", "buyer", "analyst"]);
  });

  it("returns empty roles when header is absent", () => {
    const ctx = extractUserContext(makeRequest({
      "Cf-Access-Authenticated-User-Email": "alice@texasautovalue.com",
    }));
    expect(ctx.roles).toEqual([]);
  });

  it("returns empty roles when header is empty string", () => {
    const ctx = extractUserContext(makeRequest({
      "Cf-Access-Authenticated-User-Email": "alice@texasautovalue.com",
      "Cf-Access-Authenticated-User-Roles": "",
    }));
    expect(ctx.roles).toEqual([]);
  });

  it("trims whitespace and treats whitespace-only headers as null", () => {
    const ctx = extractUserContext(makeRequest({
      "Cf-Access-Authenticated-User-Email": "   ",
      "Cf-Access-Authenticated-User-Name": "  Alice  ",
    }));
    expect(ctx.email).toBeNull();
    expect(ctx.name).toBe("Alice");
  });

  it("filters out empty entries from a malformed roles header", () => {
    const ctx = extractUserContext(makeRequest({
      "Cf-Access-Authenticated-User-Email": "alice@texasautovalue.com",
      "Cf-Access-Authenticated-User-Roles": "manager,,buyer, ,",
    }));
    expect(ctx.roles).toEqual(["manager", "buyer"]);
  });
});

describe("canForceRefresh", () => {
  const baseCtx = {
    userId: "alice@texasautovalue.com",
    email:  "alice@texasautovalue.com",
    name:   "Alice",
    roles:  [] as string[],
  };

  it("allows when role includes 'manager'", () => {
    expect(canForceRefresh({ ...baseCtx, roles: ["manager"] }, undefined)).toBe(true);
  });

  it("allows when role includes 'manager' alongside other roles", () => {
    expect(canForceRefresh({ ...baseCtx, roles: ["buyer", "manager"] }, "")).toBe(true);
  });

  it("allows when email is in the allowlist (case-insensitive match)", () => {
    expect(canForceRefresh(
      { ...baseCtx, email: "ALICE@texasautovalue.com" },
      "alice@texasautovalue.com,bob@texasautovalue.com",
    )).toBe(true);
  });

  it("allows when allowlist contains entries with surrounding whitespace", () => {
    expect(canForceRefresh(
      baseCtx,
      "  alice@texasautovalue.com ,  bob@texasautovalue.com  ",
    )).toBe(true);
  });

  it("denies when neither role nor email matches", () => {
    expect(canForceRefresh(
      { ...baseCtx, email: "carol@texasautovalue.com" },
      "alice@texasautovalue.com,bob@texasautovalue.com",
    )).toBe(false);
  });

  it("denies when roles is empty and allowlist is undefined", () => {
    expect(canForceRefresh(baseCtx, undefined)).toBe(false);
  });

  it("denies when roles is empty and allowlist is empty string", () => {
    expect(canForceRefresh(baseCtx, "")).toBe(false);
  });

  it("denies when email is null (anonymous context)", () => {
    expect(canForceRefresh(
      { ...baseCtx, email: null, userId: null },
      "alice@texasautovalue.com",
    )).toBe(false);
  });

  it("does NOT match prefixed emails (no substring matching)", () => {
    expect(canForceRefresh(
      { ...baseCtx, email: "alice2@texasautovalue.com" },
      "alice@texasautovalue.com",
    )).toBe(false);
  });
});
