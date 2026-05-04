import { describe, it, expect } from "vitest";
import { verifyHmac } from "../src/auth/hmac";

// Uses Web Crypto (globalThis.crypto) — available in Node 20 without imports.
async function sign(body: ArrayBuffer, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, body);
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

const SECRET = "test-hmac-secret";
const BODY = new TextEncoder().encode('{"source":"facebook"}').buffer as ArrayBuffer;

describe("verifyHmac", () => {
  it("accepts a valid signature", async () => {
    const sig = await sign(BODY, SECRET);
    expect(await verifyHmac(BODY, sig, SECRET)).toBe(true);
  });

  it("rejects a wrong signature", async () => {
    expect(await verifyHmac(BODY, "sha256=deadbeef00", SECRET)).toBe(false);
  });

  it("rejects a header without the sha256= prefix", async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, BODY);
    const hex = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    // Valid hex but missing "sha256=" prefix
    expect(await verifyHmac(BODY, hex, SECRET)).toBe(false);
  });

  it("rejects an empty header", async () => {
    expect(await verifyHmac(BODY, "", SECRET)).toBe(false);
  });

  it("rejects a valid signature when the body is mutated", async () => {
    const sig = await sign(BODY, SECRET);
    const mutated = new TextEncoder().encode('{"source":"mutated"}').buffer as ArrayBuffer;
    expect(await verifyHmac(mutated, sig, SECRET)).toBe(false);
  });
});
