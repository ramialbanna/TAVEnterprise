/**
 * Item 74 — attach one GoLogin US residential to a profile.
 *
 * Does not start Orbita, open Facebook, or print tokens / proxy passwords.
 * Each Facebook login needs its own sticky session — never reuse another
 * profile's proxy username.
 *
 * Usage:
 *   node scripts/gologin-assign-residential.mjs --traffic-only
 *   node scripts/gologin-assign-residential.mjs
 *   node scripts/gologin-assign-residential.mjs --profile-id <id> --name fb_buyer_11_gologin_us
 *
 * Requires in `.dev.vars`: GOLOGIN_API_TOKEN, GOLOGIN_WORKSPACE_ID (rami).
 * Profile defaults to GOLOGIN_PROFILE_ID when --profile-id is omitted.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import tls from "node:tls";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEV_VARS = path.join(ROOT, ".dev.vars");
const API = "https://api.gologin.com";
const RAMI_WORKSPACE = "6a3439c37b918d79b8ed7d3a";
const MIN_RESIDENTIAL_GB = 1;
const DEFAULT_PROXY_NAME = "fb_buyer_10_gologin_us";
const GEO_HOST = "geo.myip.link";
const BRIGHT_DATA_HOST = "brd.superproxy.io";

function parseArgs(argv) {
  const args = { trafficOnly: false, profileId: null, customName: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--traffic-only") args.trafficOnly = true;
    else if (token === "--profile-id") args.profileId = String(argv[++i] || "").trim();
    else if (token === "--name") args.customName = String(argv[++i] || "").trim();
  }
  return args;
}

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

function bytesToGb(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round((n / 1024 ** 3) * 1000) / 1000;
}

function trafficSlice(data) {
  if (!data || typeof data !== "object") return { usedGb: null, limitGb: null };
  const used = data.trafficUsedBytes ?? data.usedBytes;
  const limit = data.trafficLimitBytes ?? data.limitBytes;
  return { usedGb: bytesToGb(used), limitGb: bytesToGb(limit) };
}

function summarizeTraffic(body) {
  const resident = body?.residentialTrafficData ?? body?.residentTrafficData ?? {};
  const mobile = body?.mobileTrafficData ?? {};
  const dc = body?.dataCenterTrafficData ?? body?.datacenterTrafficData ?? {};
  return {
    residential: trafficSlice(resident),
    mobile: trafficSlice(mobile),
    datacenter: trafficSlice(dc),
  };
}

function redactProxy(proxy) {
  if (!proxy || typeof proxy !== "object") return { mode: null };
  const host = proxy.host ?? proxy.hostname ?? null;
  return {
    mode: proxy.mode ?? null,
    host,
    port: proxy.port ?? null,
    country: proxy.country ?? proxy.countryCode ?? null,
    usernameSet: Boolean(proxy.username),
    passwordSet: Boolean(proxy.password),
    isBrightData: typeof host === "string" && host.includes(BRIGHT_DATA_HOST),
  };
}

async function gologin(token, method, pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

function errorMessage(body) {
  if (!body || typeof body !== "object") return String(body ?? "");
  return body.message || body.error || body.statusMessage || JSON.stringify(body).slice(0, 240);
}

function checkIpThroughHttpProxy(proxy) {
  const host = proxy.host ?? proxy.hostname;
  const port = Number(proxy.port);
  const username = proxy.username;
  const password = proxy.password;
  if (!host || !port || isPlaceholder(username) || isPlaceholder(password)) {
    return Promise.resolve({ ok: false, reason: "proxy_credentials_missing" });
  }

  return new Promise((resolve) => {
    const req = http.request({
      host,
      port,
      method: "CONNECT",
      path: `${GEO_HOST}:443`,
      headers: {
        Host: `${GEO_HOST}:443`,
        "Proxy-Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
    });
    req.setTimeout(20_000, () => {
      req.destroy();
      resolve({ ok: false, reason: "connect_timeout" });
    });
    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        resolve({ ok: false, reason: `connect_${res.statusCode}` });
        return;
      }
      const tlsSocket = tls.connect(
        { host: GEO_HOST, servername: GEO_HOST, socket },
        () => {
          tlsSocket.write(
            `GET / HTTP/1.1\r\nHost: ${GEO_HOST}\r\nConnection: close\r\n\r\n`,
          );
        },
      );
      const chunks = [];
      tlsSocket.on("data", (chunk) => chunks.push(chunk));
      tlsSocket.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const split = raw.indexOf("\r\n\r\n");
        const payload = split === -1 ? raw : raw.slice(split + 4);
        try {
          const geo = JSON.parse(payload);
          resolve({
            ok: true,
            ip: geo.ip ?? geo.query ?? null,
            country: geo.country ?? geo.countryCode ?? geo.country_code ?? null,
          });
        } catch {
          resolve({ ok: false, reason: "geo_parse_failed" });
        }
      });
      tlsSocket.on("error", (err) => {
        resolve({ ok: false, reason: err.code || err.message });
      });
    });
    req.on("error", (err) => {
      resolve({ ok: false, reason: err.code || err.message });
    });
    req.end();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const trafficOnly = args.trafficOnly;
  const env = { ...loadDevVars(DEV_VARS), ...process.env };
  const token = (env.GOLOGIN_API_TOKEN || env.GL_API_TOKEN || "").trim();
  const profileId = (args.profileId || env.GOLOGIN_PROFILE_ID || "").trim();
  const proxyName = (args.customName || DEFAULT_PROXY_NAME).trim();
  const workspaceId = (env.GOLOGIN_WORKSPACE_ID || RAMI_WORKSPACE).trim();

  if (isPlaceholder(token)) {
    console.error("Set GOLOGIN_API_TOKEN in .dev.vars");
    process.exit(1);
  }
  if (isPlaceholder(profileId)) {
    console.error("Set GOLOGIN_PROFILE_ID in .dev.vars");
    process.exit(1);
  }

  const trafficQs = `?currentWorkspace=${encodeURIComponent(workspaceId)}`;
  const traffic = await gologin(token, "GET", `/users-proxies/geolocation/traffic${trafficQs}`);
  if (!traffic.ok) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          step: "traffic",
          status: traffic.status,
          error: errorMessage(traffic.body),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const trafficSummary = summarizeTraffic(traffic.body);
  const residentialGb = trafficSummary.residential.limitGb;
  const unusedGb =
    trafficSummary.residential.limitGb != null && trafficSummary.residential.usedGb != null
      ? Math.round((trafficSummary.residential.limitGb - trafficSummary.residential.usedGb) * 1000) / 1000
      : null;

  if (trafficOnly) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          step: "traffic",
          workspaceId,
          profileId,
          traffic: trafficSummary,
          unusedResidentialGb: unusedGb,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (residentialGb == null || residentialGb < MIN_RESIDENTIAL_GB) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          step: "traffic_gate",
          reason: "residential_pool_too_small",
          expectedMinGb: MIN_RESIDENTIAL_GB,
          traffic: trafficSummary,
          hint: "Wrong workspace or guest token. Need rami ~2 GB, not the 0.49 GB automation pool.",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const created = await gologin(token, "POST", `/users-proxies/mobile-proxy${trafficQs}`, {
    countryCode: "us",
    isDc: false,
    isMobile: false,
    profileIdToLink: profileId,
    customName: proxyName,
  });
  if (!created.ok) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          step: "create",
          status: created.status,
          error: errorMessage(created.body),
          traffic: trafficSummary,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const browser = await gologin(token, "GET", `/browser/${profileId}`);
  const proxy = browser.body?.proxy ?? {};
  const confirmed = redactProxy(proxy);
  const geo = confirmed.mode && confirmed.mode !== "none" && !confirmed.isBrightData
    ? await checkIpThroughHttpProxy(proxy)
    : { ok: false, reason: "skipped" };

  const ok =
    browser.ok &&
    confirmed.mode &&
    confirmed.mode !== "none" &&
    !confirmed.isBrightData &&
    Boolean(confirmed.host);

  console.log(
    JSON.stringify(
      {
        ok,
        step: "assigned",
        workspaceId,
        profileId,
        customName: proxyName,
        traffic: trafficSummary,
        unusedResidentialGb: unusedGb,
        createStatus: created.status,
        proxy: confirmed,
        geoCheck: geo,
      },
      null,
      2,
    ),
  );
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
