import { describe, expect, it } from "vitest";
import { resolveSignInParams } from "./params";

describe("resolveSignInParams", () => {
  it("defaults callbackUrl to / when absent", () => {
    expect(resolveSignInParams(undefined)).toEqual({ callbackUrl: "/", accessDenied: false });
    expect(resolveSignInParams({})).toEqual({ callbackUrl: "/", accessDenied: false });
  });

  it("preserves a relative callbackUrl (incl. query)", () => {
    expect(resolveSignInParams({ callbackUrl: "/historical?year=2024" }).callbackUrl).toBe("/historical?year=2024");
    expect(resolveSignInParams({ callbackUrl: "/" }).callbackUrl).toBe("/");
  });

  it("rejects an absolute / protocol-relative callbackUrl (open-redirect guard)", () => {
    expect(resolveSignInParams({ callbackUrl: "https://evil.example" }).callbackUrl).toBe("/");
    expect(resolveSignInParams({ callbackUrl: "//evil.example" }).callbackUrl).toBe("/");
    expect(resolveSignInParams({ callbackUrl: "javascript:alert(1)" }).callbackUrl).toBe("/");
    expect(resolveSignInParams({ callbackUrl: "" }).callbackUrl).toBe("/");
  });

  it("flags accessDenied only for error=AccessDenied", () => {
    expect(resolveSignInParams({ error: "AccessDenied" }).accessDenied).toBe(true);
    expect(resolveSignInParams({ error: "Configuration" }).accessDenied).toBe(false);
    expect(resolveSignInParams({}).accessDenied).toBe(false);
  });

  it("handles array-valued query params", () => {
    expect(resolveSignInParams({ callbackUrl: ["/a", "/b"] }).callbackUrl).toBe("/");
    expect(resolveSignInParams({ error: ["AccessDenied"] }).accessDenied).toBe(true);
  });
});
