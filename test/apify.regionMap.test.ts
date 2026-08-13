import { describe, it, expect } from "vitest";
import {
  APIFY_TASK_CONFIG,
  APIFY_TASK_REGION_MAP,
  mapApifyTaskConfig,
  mapApifyTaskToRegion,
} from "../src/apify/regionMap";

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

  it("maps tav-ok (Xpq656NgueqfXDHvU) to oklahoma_city_ok", () => {
    expect(mapApifyTaskToRegion("Xpq656NgueqfXDHvU")).toBe("oklahoma_city_ok");
  });

  it("maps dallas-nick-task (ZQEsd3nHcLAs5kLwL) to dallas_tx", () => {
    expect(mapApifyTaskToRegion("ZQEsd3nHcLAs5kLwL")).toBe("dallas_tx");
  });

  it("maps oklahoma custom task (UfFehLMz5zylHOxCS) to oklahoma_city_ok", () => {
    expect(mapApifyTaskToRegion("UfFehLMz5zylHOxCS")).toBe("oklahoma_city_ok");
  });

  it("maps cl-dallas-automotive (NMTFTt1C0aEnhEuY9) to dallas_tx / craigslist", () => {
    expect(mapApifyTaskToRegion("NMTFTt1C0aEnhEuY9")).toBe("dallas_tx");
    expect(mapApifyTaskConfig("NMTFTt1C0aEnhEuY9")).toEqual({
      region: "dallas_tx",
      source: "craigslist",
    });
  });

  it("returns null for an unknown task id", () => {
    expect(mapApifyTaskToRegion("not-a-real-task-id")).toBeNull();
    expect(mapApifyTaskConfig("not-a-real-task-id")).toBeNull();
  });

  it("maps all wired Apify tasks (FB four + custom dallas/oklahoma + CL dallas)", () => {
    expect(Object.keys(APIFY_TASK_REGION_MAP).sort()).toEqual(
      [
        "MWtcjZFWqJrnYChgp",
        "NMTFTt1C0aEnhEuY9",
        "UfFehLMz5zylHOxCS",
        "Xpq656NgueqfXDHvU",
        "ZQEsd3nHcLAs5kLwL",
        "nccVufFs2grLH4Qsj",
        "vk7OijnAOOo8V1ekc",
      ],
    );
    expect(Object.keys(APIFY_TASK_CONFIG).sort()).toEqual(
      Object.keys(APIFY_TASK_REGION_MAP).sort(),
    );
  });

  it("defaults Facebook tasks to source facebook", () => {
    expect(mapApifyTaskConfig("ZQEsd3nHcLAs5kLwL")?.source).toBe("facebook");
  });
});
