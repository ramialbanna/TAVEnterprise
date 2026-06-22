import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../web/.env.smoke.prod.tmp");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      const key = line.slice(0, i);
      let value = line.slice(i + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }),
);

const secret = env.APP_API_SECRET;
if (!secret) {
  console.error("APP_API_SECRET missing");
  process.exit(1);
}

const base = (env.APP_API_BASE_URL ?? "https://tav-aip-production.rami-1a9.workers.dev").replace(
  /\/app\/?$/,
  "",
);

const res = await fetch(`${base}/app/mmr/vin`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  },
  body: JSON.stringify({
    vin: "1FT8W4DT8JEB57132",
    mileage: 200,
    adjustments: { grade: "4.5", color: "Black", exclude_build: false },
  }),
});

const json = await res.json();
if (!json.ok) {
  console.error("lookup failed", JSON.stringify(json, null, 2));
  process.exit(1);
}

const d = json.data ?? {};
console.log(
  JSON.stringify(
    {
      adjustedMmr: d.adjustedMmr,
      mmrValue: d.mmrValue,
      gradeAdjustment: d.gradeAdjustment,
      colorAdjustment: d.colorAdjustment,
      odometerAdjustment: d.odometerAdjustment,
      buildOptionsAdjustment: d.buildOptionsAdjustment,
      mileageUsed: d.mileageUsed,
      avgOdometer: d.avgOdometer,
    },
    null,
    2,
  ),
);
