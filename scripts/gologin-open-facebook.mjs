/**
 * Item 74 action 6 — open a GoLogin profile on Facebook (signup or home).
 *
 * Local Orbita only. Leaves the window open until this process is killed.
 * Does not fill the form, paste cookies, or write to our database.
 *
 * Usage:
 *   node scripts/gologin-open-facebook.mjs --profile-id <id>
 *   node scripts/gologin-open-facebook.mjs --profile-id <id> --signup
 *
 * Defaults to GOLOGIN_PROFILE_ID_11, then GOLOGIN_PROFILE_ID.
 */
import "./lib/gologin-fs-patch.mjs";
import fs from "node:fs";
import path from "node:path";
import { GologinApi } from "gologin";
import { sleep } from "./lib/facebook-seller-extract.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const WAIT_MS = 45_000;
const SIGNUP_URL = "https://www.facebook.com/r.php";
const HOME_URL = "https://www.facebook.com/";

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
  const args = { profileId: null, signup: false, url: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--profile-id") args.profileId = String(argv[++i] || "").trim();
    else if (token === "--signup") args.signup = true;
    else if (token === "--url") args.url = String(argv[++i] || "").trim();
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...loadDevVars(DEV_VARS), ...process.env };
  const token = (env.GOLOGIN_API_TOKEN || env.GL_API_TOKEN || "").trim();
  const profileId = (
    args.profileId ||
    env.GOLOGIN_PROFILE_ID_11 ||
    env.GOLOGIN_PROFILE_ID ||
    ""
  ).trim();

  if (isPlaceholder(token) || isPlaceholder(profileId)) {
    console.error("Need GOLOGIN_API_TOKEN and --profile-id (or GOLOGIN_PROFILE_ID_11)");
    process.exit(1);
  }

  const targetUrl = args.url || (args.signup ? SIGNUP_URL : HOME_URL);
  console.error(`launching local Orbita profile ${profileId}…`);
  const GL = GologinApi({ token });
  const launched = await GL.launch({ profileId });
  const browser = launched.browser;
  const page = await browser.newPage();
  page.setDefaultTimeout(WAIT_MS);

  const shutdown = async () => {
    try {
      await page.close();
    } catch {
      // ignore
    }
    try {
      await browser.close();
    } catch {
      // ignore
    }
    try {
      if (typeof GL.exit === "function") await GL.exit();
    } catch {
      // ignore
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error(`opening ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: WAIT_MS });
  await sleep(2500);

  const pageUrl = page.url();
  const title = await page.title().catch(() => "");
  console.log(
    JSON.stringify(
      {
        ok: true,
        profileId,
        pageUrl,
        title,
        keepOpen: true,
        hint: "Finish signup in the Orbita window. Ctrl+C here closes the browser.",
      },
      null,
      2,
    ),
  );

  await new Promise(() => {});
}

main().catch((err) => {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(msg);
  process.exit(1);
});
