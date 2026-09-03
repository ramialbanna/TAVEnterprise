/**
 * Item 74 — GoLogin API connectivity check.
 *
 * Lists browser profiles. Does not start Orbita, open Facebook, or write
 * to our database. Never prints facebookAccountData / cookies / proxy secrets.
 *
 * Usage:
 *   node scripts/gologin-ping.mjs
 *
 * Requires GOLOGIN_API_TOKEN (or GL_API_TOKEN) in `.dev.vars` or env.
 * Token: https://app.gologin.com/personalArea/TokenApi
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const API = "https://api.gologin.com";

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

function tokenFromEnv(env) {
  const raw = (env.GOLOGIN_API_TOKEN || env.GL_API_TOKEN || "").trim();
  if (!raw || raw === "replace_me") return null;
  return raw;
}

function osLabel(profile) {
  const os = profile.os;
  if (typeof os === "string" && os) return os;
  if (os && typeof os === "object") {
    return os.name || os.os || os.type || JSON.stringify(os);
  }
  return profile.navigator?.platform ?? "";
}

async function gologinGet(token, pathname) {
  const res = await fetch(`${API}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const env = { ...loadDevVars(DEV_VARS), ...process.env };
  const token = tokenFromEnv(env);
  if (!token) {
    console.error(
      "Set GOLOGIN_API_TOKEN in .dev.vars (or GL_API_TOKEN in env). Get it from https://app.gologin.com/personalArea/TokenApi",
    );
    process.exit(1);
  }

  const user = await gologinGet(token, "/user");
  if (user.status === 401 || user.status === 403) {
    console.error(`Auth failed (${user.status}). Token rejected.`);
    process.exit(1);
  }

  const list = await gologinGet(token, "/browser/v2?page=1");
  if (!list.ok) {
    console.error(`GET /browser/v2 failed (${list.status})`, list.body);
    process.exit(1);
  }

  const profiles = Array.isArray(list.body?.profiles) ? list.body.profiles : [];
  const rows = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    os: osLabel(p),
    proxyType: p.proxyType ?? "",
    isRunning: Boolean(p.isRunning),
    lastActivity: p.lastActivity ?? "",
  }));

  const wantedId = (env.GOLOGIN_PROFILE_ID || "").trim();
  const wantedName = (env.GOLOGIN_NAME || "").trim().toLowerCase();
  const selected = rows.find((p) => p.id === wantedId)
    ?? rows.find((p) => p.name.trim().toLowerCase() === wantedName)
    ?? null;

  const email =
    typeof user.body?.email === "string"
      ? user.body.email
      : typeof user.body?.user?.email === "string"
        ? user.body.user.email
        : null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        userStatus: user.status,
        ...(email ? { email } : {}),
        allProfilesCount: list.body?.allProfilesCount ?? rows.length,
        selected,
        profiles: rows,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
