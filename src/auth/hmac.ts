// Timing-safe HMAC-SHA256 verification via SubtleCrypto.
// Body must be read as ArrayBuffer before calling this function —
// never pass a string to avoid encoding ambiguity.

export async function verifyHmac(
  body: ArrayBuffer,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const hexSig = signatureHeader.slice("sha256=".length);

  let sigBytes: Uint8Array;
  try {
    sigBytes = hexToBytes(hexSig);
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  // crypto.subtle.verify is constant-time — safe against timing attacks.
  return crypto.subtle.verify("HMAC", key, sigBytes, body);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("odd-length hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
