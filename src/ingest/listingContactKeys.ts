/**
 * §80 action 1 — find a phone, website, WhatsApp link, or email in listing text.
 * The same key on 3 different cars is handled by the persistence layer.
 */

function phonePattern(): RegExp {
  return /(?:\+?1[\s.-]?)?(?:\(([2-9]\d{2})\)|([2-9]\d{2}))[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})/g;
}

function emailPattern(): RegExp {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
}

function urlPattern(): RegExp {
  return /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
}

function whatsAppPattern(): RegExp {
  return /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/[^\s<>"')\]]+/gi;
}

const SKIP_HOSTS = [
  "facebook.com",
  "fb.com",
  "fb.watch",
  "fbcdn.net",
  "instagram.com",
  "messenger.com",
];

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export type ListingContactText = {
  title?: string | null;
  description?: string | null;
};

export function contactVehicleKey(listingUrl: string, vin?: string | null): string {
  const cleaned = vin?.trim().toUpperCase() ?? "";
  if (VIN_RE.test(cleaned)) return `vin:${cleaned}`;
  return `url:${listingUrl.trim()}`;
}

export function phoneKeyFromDigits(digits: string): string | null {
  let normalized = digits.replace(/\D/g, "");
  if (normalized.length === 11 && normalized.startsWith("1")) normalized = normalized.slice(1);
  if (normalized.length !== 10) return null;
  if (normalized[0] < "2" || normalized[0] > "9") return null;
  if (normalized[3] < "2" || normalized[3] > "9") return null;
  return `phone:${normalized}`;
}

function bounded(text: string, start: number, end: number): boolean {
  const prev = start > 0 ? text[start - 1] : "";
  const next = end < text.length ? text[end] : "";
  if (prev && /[A-Za-z0-9]/.test(prev)) return false;
  if (next && /[A-Za-z0-9]/.test(next)) return false;
  if (prev === "$") return false;
  return !/^\s*(?:miles|mileage|mi)\b/i.test(text.slice(end, end + 16));
}

function addPhones(text: string, keys: Set<string>): void {
  for (const match of text.matchAll(phonePattern())) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (!bounded(text, start, end)) continue;
    const key = phoneKeyFromDigits(match[0]);
    if (key) keys.add(key);
  }
}

function websiteKey(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.;]+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;
  if (SKIP_HOSTS.some((skipped) => host === skipped || host.endsWith(`.${skipped}`))) return null;

  const phoneInLink = phoneKeyFromDigits(`${url.pathname}${url.search}`);
  const whatsAppHost =
    host === "wa.me" || host === "whatsapp.com" || host.endsWith(".whatsapp.com");
  if (whatsAppHost && phoneInLink) return phoneInLink;

  if (whatsAppHost) {
    const path = `${host}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
    return path.length > host.length ? `url:${path}` : null;
  }

  return `url:${host}`;
}

function addUrls(text: string, pattern: RegExp, keys: Set<string>): void {
  for (const match of text.matchAll(pattern)) {
    const key = websiteKey(match[0]);
    if (key) keys.add(key);
  }
}

export function extractListingContactKeys(input: ListingContactText): string[] {
  const text = [input.title, input.description].filter(Boolean).join("\n");
  if (!text.trim()) return [];

  const keys = new Set<string>();
  addUrls(text, whatsAppPattern(), keys);
  addUrls(text, urlPattern(), keys);

  for (const match of text.matchAll(emailPattern())) {
    keys.add(`email:${match[0].toLowerCase()}`);
  }

  addPhones(text, keys);
  return [...keys];
}
