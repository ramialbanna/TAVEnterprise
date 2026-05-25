import { describe, it, expect } from "vitest";
import { APIFY_TASK_REGION_MAP, mapApifyTaskToRegion } from "../src/apify/regionMap";

describe("Apify task → TAV region mapping", () => {
  it("maps tav-tx-east (nccVufFs2grLH4Qsj) to dallas_tx", () => {
    expect(mapApifyTaskToRegion("nccVufFs2grLH4Qsj")).toBe("dallas_tx");
  });

  it("maps tav-tx-south (MWtcjZFWqJrnYChgp) to san_antonio_tx", () => {
    expect(mapApifyTaskToRegion("MWtcjZFWqJrnYChgp")).toBe("san_antonio_tx");
  });

  it("maps tav-tx-west (vk7OijnAOOo8V1ekc) to lubbock_tx", () => {
    expect(mapApifyTaskToRegion("vk7OijnAOOo8V1ekc")).toBe("lubbock_tx");
  });

  it("returns null for tav-ok (Oklahoma City) — outside Texas REGION_KEYS", () => {
    expect(mapApifyTaskToRegion("Xpq656NgueqfXDHvU")).toBeNull();
  });

  it("returns null for an unknown task id", () => {
    expect(mapApifyTaskToRegion("not-a-real-task-id")).toBeNull();
  });

  it("only the three intentionally-mapped tasks are in the map", () => {
    expect(Object.keys(APIFY_TASK_REGION_MAP).sort()).toEqual(
      ["MWtcjZFWqJrnYChgp", "nccVufFs2grLH4Qsj", "vk7OijnAOOo8V1ekc"],
    );
  });
});
