/** Item 74 — Facebook Marketplace seller extract (shared by probe + enrich). */

export const NAME_CHROME =
  /^(seller details|seller information|seller info|see more|see all|view profile|message|follow|share|report|about|save|sold by)$/i;

const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "fb.com",
  "www.fb.com",
]);

const HEAVY_PROXY_RESOURCE_TYPES = new Set(["image", "media", "font"]);

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Gallery/video/font bytes are useless for seller_url and dominate Floppydata usage. */
export function isHeavyProxyResource(resourceType) {
  return HEAVY_PROXY_RESOURCE_TYPES.has(String(resourceType || "").toLowerCase());
}

export async function stripHeavyProxyAssets(page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (isHeavyProxyResource(request.resourceType())) {
      request.abort().catch(() => {});
      return;
    }
    request.continue().catch(() => {});
  });
}

export function normalizeSellerUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";
    let pathName = url.pathname.replace(/\/+$/, "");
    if (!pathName) pathName = "/";
    return `${url.protocol}//${url.host.toLowerCase()}${pathName.toLowerCase()}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }
}

export function normalizeSellerName(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function usableName(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text || text.length < 2 || text.length > 80) return null;
  if (NAME_CHROME.test(text)) return null;
  if (/^https?:/i.test(text)) return null;
  return text;
}

export function isFacebookListingUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    if (!FACEBOOK_HOSTS.has(url.host.toLowerCase())) return false;
    return /\/marketplace\/item\/\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isFacebookMarketplaceProfileUrl(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    if (!FACEBOOK_HOSTS.has(url.host.toLowerCase())) return false;
    return /\/marketplace\/profile\/\d+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function pickSeller(candidates, extraNames = []) {
  const ranked = candidates
    .map((row) => {
      const href = String(row.href || "").split("#")[0];
      const name =
        usableName(row.aria) || usableName(row.text) || usableName(row.parent) || null;
      let score = 0;
      if (/\/marketplace\/profile\//i.test(href)) score += 3;
      if (/\/profile\.php\?id=/i.test(href)) score += 2;
      if (/\/people\//i.test(href)) score += 1;
      if (name) score += 2;
      return { href, name, score, normalizedUrl: normalizeSellerUrl(href) };
    })
    .filter((row) => row.href.startsWith("http") && !/\/login/i.test(row.href))
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const unique = [];
  for (const row of ranked) {
    if (seen.has(row.normalizedUrl)) continue;
    seen.add(row.normalizedUrl);
    unique.push(row);
  }
  const best = unique[0] ?? null;
  if (best && !best.name) {
    best.name = extraNames.map(usableName).find(Boolean) ?? null;
  }
  return unique;
}

export async function scrapeSeller(page) {
  return page.evaluate(() => {
    const chrome =
      /^(seller details|seller information|seller info|see more|see all|view profile|message|follow|share|report|about|save|sold by)$/i;
    const clean = (raw) => String(raw || "").replace(/\s+/g, " ").trim();
    const usable = (raw) => {
      const text = clean(raw);
      if (!text || text.length < 2 || text.length > 80) return "";
      if (chrome.test(text)) return "";
      if (/^https?:/i.test(text)) return "";
      return text;
    };

    const candidates = [];
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.href || "";
      if (
        !/facebook\.com\/marketplace\/profile\//i.test(href) &&
        !/facebook\.com\/profile\.php/i.test(href) &&
        !/facebook\.com\/people\//i.test(href)
      ) {
        continue;
      }
      candidates.push({
        href,
        text: clean(a.innerText).slice(0, 80),
        aria: clean(a.getAttribute("aria-label")).slice(0, 80),
        parent: clean(a.parentElement?.innerText).slice(0, 120),
      });
    }

    const headings = [...document.querySelectorAll("h1, h2, [role='dialog'] h1, [role='dialog'] h2")]
      .map((el) => usable(el.innerText))
      .filter(Boolean);

    const dialog = document.querySelector("[role='dialog']");
    const dialogNames = dialog
      ? [...dialog.querySelectorAll("span, a, h1, h2")]
          .map((el) => usable(el.innerText))
          .filter(Boolean)
          .slice(0, 8)
      : [];

    return {
      finalUrl: location.href,
      title: clean(document.querySelector("h1")?.innerText || document.title).slice(0, 160),
      loginWall: Boolean(/\/login/i.test(location.href) || document.querySelector('input[name="email"]')),
      checkpoint: Boolean(
        /checkpoint|confirm.?identity|we.?suspended|temporarily.?blocked/i.test(document.body?.innerText || ""),
      ),
      deadListing: Boolean(
        /this listing (isn.?t|is not) available|content isn.?t available|this page isn.?t available/i.test(
          document.body?.innerText || "",
        ),
      ),
      candidates,
      extraNames: [...headings, ...dialogNames],
    };
  });
}

function jitter(minMs, maxMs) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

/**
 * Trusted mouse click on Seller details. Do not click the profile href —
 * that navigates off the listing. Skip this entirely when the listing
 * already exposes `/marketplace/profile/{id}`.
 */
export async function openSellerDetails(page) {
  const box = await page.evaluate(() => {
    const matches = (el) => {
      const text = `${el.getAttribute("aria-label") || ""} ${el.innerText || ""}`;
      return /seller details|seller information/i.test(text);
    };
    const nodes = [...document.querySelectorAll("a[href], div[role='button'], span[role='button']")];
    const target = nodes.find(matches);
    if (!target) return null;
    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!box) return false;
  await page.mouse.move(box.x, box.y, { steps: 8 + Math.floor(Math.random() * 8) });
  await sleep(jitter(80, 180));
  await page.mouse.click(box.x, box.y);
  await Promise.race([
    page.waitForSelector("[role='dialog']", { timeout: 8_000 }).catch(() => null),
    sleep(jitter(400, 800)),
  ]);
  await sleep(jitter(150, 400));
  return true;
}

export async function warmupFacebookSession(page, waitMs) {
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: waitMs });
  await sleep(jitter(400, 900));
  const snapshot = await scrapeSeller(page);
  if (snapshot.loginWall) {
    return { ok: false, skipReason: "login_wall", snapshot };
  }
  if (snapshot.checkpoint) {
    return { ok: false, skipReason: "checkpoint", snapshot };
  }
  return { ok: true, skipReason: null, snapshot };
}

export async function extractSellerFromListingPage(page, listingUrl, waitMs) {
  await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: waitMs });
  await sleep(200);

  try {
    await page.waitForFunction(
      () =>
        Boolean(
          document.querySelector('a[href*="/marketplace/profile/"]') ||
            document.querySelector('a[href*="profile.php?id="]') ||
            document.body?.innerText?.match(/seller details/i) ||
            document.querySelector('input[name="email"]'),
        ),
      { timeout: waitMs },
    );
  } catch {
    // Fall through and scrape whatever rendered.
  }

  let snapshot = await scrapeSeller(page);
  if (snapshot.loginWall || snapshot.checkpoint || snapshot.deadListing) {
    return { snapshot, sellers: [], skipReason: snapshot.loginWall ? "login_wall" : snapshot.checkpoint ? "checkpoint" : "dead_listing" };
  }

  let sellers = pickSeller(snapshot.candidates, snapshot.extraNames);
  const hrefReady = Boolean(
    sellers[0]?.normalizedUrl && isFacebookMarketplaceProfileUrl(sellers[0].normalizedUrl),
  );
  // Blacklist key is the profile URL. Do not click Seller details when the
  // listing already exposed it — that click is the bot-looking part.
  if (!hrefReady) {
    await openSellerDetails(page);
    snapshot = await scrapeSeller(page);
    sellers = pickSeller(snapshot.candidates, snapshot.extraNames);
    if (snapshot.loginWall || snapshot.checkpoint) {
      return {
        snapshot,
        sellers,
        skipReason: snapshot.loginWall ? "login_wall" : "checkpoint",
      };
    }
  }

  const best = sellers[0] ?? null;
  const sellerUrl = best?.normalizedUrl ?? null;
  const sellerName = best?.name || snapshot.extraNames.map(usableName).find(Boolean) || null;
  if (!sellerUrl || !isFacebookMarketplaceProfileUrl(sellerUrl)) {
    return { snapshot, sellers, sellerUrl: null, sellerName, skipReason: "missing_profile_href" };
  }

  return {
    snapshot,
    sellers,
    sellerUrl,
    sellerName,
    skipReason: null,
  };
}
