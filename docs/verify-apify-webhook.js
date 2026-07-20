const fs = require("fs");
const path = require("path");
const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
const token = env.match(/^APIFY_TOKEN=(.+)$/m)[1].trim();

async function get(p) {
  const r = await fetch("https://api.apify.com" + p, {
    headers: { Authorization: "Bearer " + token },
  });
  return { status: r.status, data: await r.json() };
}

(async () => {
  const start = await fetch(
    "https://api.apify.com/v2/actor-tasks/ZQEsd3nHcLAs5kLwL/runs",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    },
  );
  const started = await start.json();
  const runId = started.data?.id;
  console.log("STARTED", start.status, runId, started.data?.status);
  if (!runId) process.exit(1);

  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const run = await get("/v2/actor-runs/" + runId);
    const status = run.data?.data?.status;
    console.log("POLL", i, status);
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
      // Find matching webhook dispatch
      const disp = await get(
        "/v2/webhooks/KEnZj0JDLClNfk5Ld/dispatches?limit=5&desc=1",
      );
      for (const d of disp.data?.data?.items || []) {
        const full = await get("/v2/webhook-dispatches/" + d.id);
        const body =
          full.data?.data?.calls?.[0]?.responseBody ||
          full.data?.data?.targets?.[0]?.responseBody ||
          "";
        console.log("DISP", d.createdAt, d.status, body.slice(0, 300));
      }
      process.exit(0);
    }
  }
  console.error("TIMEOUT waiting for run");
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
