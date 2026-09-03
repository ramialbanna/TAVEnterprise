/**
 * Item 74 — one-listing seller probe (no DB writes).
 *
 * Starts GOLOGIN_PROFILE_ID, opens a Marketplace item URL, clicks through
 * Seller details, prints seller profile href + display name.
 *
 * Usage:
 *   node scripts/gologin-seller-probe.mjs
 *   node scripts/gologin-seller-probe.mjs --cloud
 *   node scripts/gologin-seller-probe.mjs --cloud "https://www.facebook.com/marketplace/item/…/"
 *
 * `--cloud` uses GoLogin Cloud (not local Orbita). Teardown is browser.close
 * plus DELETE /browser/{id}/web. Do not GL.exit() on cloud (that also
 * stopLocal and throws Invalid profile folder path).
 */
import "./lib/gologin-fs-patch.mjs";
import fs from "node:fs";
import path from "node:path";
import { GologinApi } from "gologin";
import {
  extractSellerFromListingPage,
  isFacebookListingUrl,
  usableName,
} from "./lib/facebook-seller-extract.mjs";
import { stopCloudProfile } from "./lib/gologin-cloud.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const DEFAULT_URL = "https://www.facebook.com/marketplace/item/959752267150487/";
const WAIT_MS = 25_000;

function loadDevVars(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

function isPlaceholder(value) {
  const raw = (value || "").trim();
  return !raw || raw === "replace_me";
}

function parseArgs(argv) {
  const args = { cloud: false, url: null };
  for (const token of argv) {
    if (token === "--cloud") args.cloud = true;
    else if (!token.startsWith("-") && !args.url) args.url = token;
  }
  args.url = (args.url || DEFAULT_URL).trim();
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...loadDevVars(DEV_VARS), ...process.env };
  const token = (env.GOLOGIN_API_TOKEN || env.GL_API_TOKEN || "").trim();
  const profileId = (env.GOLOGIN_PROFILE_ID || "").trim();
  const listingUrl = args.url;

  if (isPlaceholder(token) || isPlaceholder(profileId)) {
    console.error("Need GOLOGIN_API_TOKEN and GOLOGIN_PROFILE_ID in .dev.vars");
    process.exit(1);
  }
  if (!isFacebookListingUrl(listingUrl)) {
    console.error("URL must be a facebook.com/marketplace/item/… link");
    process.exit(1);
  }

  const startedAt = Date.now();
  const mode = args.cloud ? "GoLogin Cloud" : "local Orbita";
  console.error(`launching profile ${profileId} (${mode})…`);

  const GL = GologinApi({ token });
  let browser = null;
  try {
    if (args.cloud) {
      const launched = await GL.launch({ profileId, cloud: true });
      browser = launched.browser;
    } else {
      const launched = await GL.launch({ profileId });
      browser = launched.browser;
    }

    const page = await browser.newPage();
    page.setDefaultTimeout(WAIT_MS);
    console.error(`opening ${listingUrl}`);
    const extracted = await extractSellerFromListingPage(page, listingUrl, WAIT_MS);
    const best = extracted.sellers[0] ?? null;
    const sellerName =
      extracted.sellerName || extracted.snapshot.extraNames.map(usableName).find(Boolean) || null;

    console.log(
      JSON.stringify(
        {
          ok: Boolean(extracted.sellerUrl) && Boolean(sellerName) && !extracted.skipReason,
          cloud: args.cloud,
          elapsedMs: Date.now() - startedAt,
          listingUrl,
          pageUrl: extracted.snapshot.finalUrl,
          pageTitle: extracted.snapshot.title,
          loginWall: extracted.snapshot.loginWall,
          checkpoint: extracted.snapshot.checkpoint,
          skipReason: extracted.skipReason,
          sellerUrl: extracted.sellerUrl ?? best?.normalizedUrl ?? null,
          sellerName,
          extraNames: extracted.snapshot.extraNames.slice(0, 8),
          candidates: extracted.sellers.slice(0, 5).map(({ normalizedUrl, name }) => ({
            sellerUrl: normalizedUrl,
            sellerName: name,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      if (browser) await browser.close();
    } catch {
      // ignore
    }
    if (args.cloud) {
      try {
        await stopCloudProfile(token, profileId);
      } catch (err) {
        console.error(`cloud slot free failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      try {
        if (typeof GL.exit === "function") await GL.exit();
      } catch {
        // Local Orbita: ignore Invalid profile folder path.
      }
    }
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err?.message || err?.code || err);
  console.error(msg);
  process.exit(1);
});
