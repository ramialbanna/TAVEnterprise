/**
 * Download a listing photo inside the Worker and return it as a base64 image
 * block source. Anthropic's URL image source fetches the link from Anthropic's
 * servers, which honour robots.txt — and the Facebook CDN disallows every
 * crawler (`User-agent: *` / `ClaudeBot`), so URL sources fail with a 400.
 * Returns null on any failure; callers send the request without the photo.
 */

const SUPPORTED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
/** Anthropic's per-image limit for base64 sources. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type InlineImageSource = {
  type: "base64";
  media_type: string;
  data: string;
};

export type InlineImageResult =
  | { ok: true; source: InlineImageSource }
  | { ok: false; reason: string };

function bytesToBase64(bytes: Uint8Array): string {
  // btoa needs a binary string; build it in chunks to stay under the argument limit.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function fetchImageAsBase64(
  url: string,
  timeoutMs: number,
): Promise<InlineImageResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };

    const mediaType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) return { ok: false, reason: "unsupported_type" };

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) return { ok: false, reason: "empty" };
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };

    return { ok: true, source: { type: "base64", media_type: mediaType, data: bytesToBase64(bytes) } };
  } catch (err) {
    return { ok: false, reason: err instanceof Error && err.name === "AbortError" ? "timeout" : "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }
}
