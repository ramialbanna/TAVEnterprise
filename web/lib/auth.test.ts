import { describe, expect, it, vi } from "vitest";

// auth.ts imports "server-only" (transitively, via env.ts) and "next-auth"; stub both so
// the pure isAllowedEmail helper can be imported and tested in isolation under vitest.
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({
  default: () => ({
    handlers: { GET: () => undefined, POST: () => undefined },
    auth: () => null,
    signIn: () => undefined,
    signOut: () => undefined,
  }),
}));
vi.mock("next-auth/providers/google", () => ({ default: () => ({}) }));

import { isAllowedEmail } from "./auth";

describe("isAllowedEmail", () => {
  const DOMAIN = "texasautovalue.com";

  it("allows an exact-domain address", () => {
    expect(isAllowedEmail("rami@texasautovalue.com", DOMAIN)).toBe(true);
  });

  it("is case-insensitive (uppercase address)", () => {
    expect(isAllowedEmail("RAMI@TEXASAUTOVALUE.COM", DOMAIN)).toBe(true);
  });

  it("is case-insensitive (mixed case)", () => {
    expect(isAllowedEmail("Rami@TexasAutoValue.Com", DOMAIN)).toBe(true);
  });

  it("is case-insensitive on the allowed-domain argument too", () => {
    expect(isAllowedEmail("rami@texasautovalue.com", "TexasAutoValue.com")).toBe(true);
  });

  it("rejects a different domain", () => {
    expect(isAllowedEmail("user@gmail.com", DOMAIN)).toBe(false);
  });

  it("rejects undefined / null / empty", () => {
    expect(isAllowedEmail(undefined, DOMAIN)).toBe(false);
    expect(isAllowedEmail(null, DOMAIN)).toBe(false);
    expect(isAllowedEmail("", DOMAIN)).toBe(false);
  });

  it("rejects a string with no @", () => {
    expect(isAllowedEmail("noatsign", DOMAIN)).toBe(false);
    expect(isAllowedEmail("   ", DOMAIN)).toBe(false);
  });

  it("rejects a suffix look-alike (allowed domain is not the real domain)", () => {
    expect(isAllowedEmail("user@texasautovalue.com.evil.com", DOMAIN)).toBe(false);
  });

  it("rejects a prefix look-alike", () => {
    expect(isAllowedEmail("user@evil-texasautovalue.com", DOMAIN)).toBe(false);
  });

  it("rejects a subdomain (v1 = exact domain only)", () => {
    expect(isAllowedEmail("user@sub.texasautovalue.com", DOMAIN)).toBe(false);
  });

  it("matches against the supplied allowed domain, not a hardcoded one", () => {
    expect(isAllowedEmail("a@example.com", "example.com")).toBe(true);
    expect(isAllowedEmail("a@example.com", "texasautovalue.com")).toBe(false);
  });
});
