import { describe, it, expect, vi } from "vitest";
import { extractFacebookListingFromHtml } from "../src/intake/facebookHtml";
import { parseListingUrl } from "../src/intake/parseListingUrl";

const FACEBOOK_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="2019 Toyota Camry SE · $18,500 · 62K miles" />
  <meta property="product:price:amount" content="18500" />
  <script>{"vehicle_odometer_data":{"unit":"MILES","value":62000}}</script>
</head>
<body></body>
</html>`;

describe("extractFacebookListingFromHtml", () => {
  it("reads og:title and product price meta", () => {
    const extracted = extractFacebookListingFromHtml(FACEBOOK_HTML);
    expect(extracted.title).toContain("2019 Toyota Camry");
    expect(extracted.price).toBe(18500);
    expect(extracted.mileage).toBe(62000);
  });

  it("reads listing_price JSON amount", () => {
    const html = `<html><script>{"listing_price":{"currency":"USD","amount":"24000"}}</script></html>`;
    expect(extractFacebookListingFromHtml(html).price).toBe(24000);
  });
});

describe("parseListingUrl", () => {
  it("returns structured fields for a Facebook marketplace page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(FACEBOOK_HTML, { status: 200, headers: { "Content-Type": "text/html" } }),
    );

    const result = await parseListingUrl(
      "https://www.facebook.com/marketplace/item/123456789",
      { fetch: fetchMock, now: () => "2026-06-01T12:00:00.000Z" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("facebook");
    expect(result.data.year).toBe(2019);
    expect(result.data.make).toBe("toyota");
    expect(result.data.model).toBe("camry");
    expect(result.data.price).toBe(18500);
    expect(result.data.mileage).toBe(62000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects unsupported marketplace hosts", async () => {
    const fetchMock = vi.fn();
    const result = await parseListingUrl("https://www.craigslist.org/dallas/cto/123.html", {
      fetch: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("unsupported_source");
    expect(result.supportedSources).toEqual(["facebook"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns fetch_failed when Facebook responds non-200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("blocked", { status: 403 }));
    const result = await parseListingUrl("https://www.facebook.com/marketplace/item/1", {
      fetch: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("fetch_failed");
  });

  it("returns partial fields when adapter rejects but HTML has title and price", async () => {
    const html = `<html><meta property="og:title" content="Great truck deal call me" />
      <meta property="product:price:amount" content="12000" /></html>`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));

    const result = await parseListingUrl("https://www.facebook.com/marketplace/item/99", {
      fetch: fetchMock,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toContain("Great truck");
    expect(result.data.price).toBe(12000);
    expect(result.data.warnings).toContain("missing_ymm");
  });

  it("returns parse_failed when nothing useful is extracted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html><body>login required</body></html>", { status: 200 }),
    );
    const result = await parseListingUrl("https://www.facebook.com/marketplace/item/0", {
      fetch: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("parse_failed");
  });
});
