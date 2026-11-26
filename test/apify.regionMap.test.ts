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

  it("maps arizona, missouri, and minnesota custom tasks", () => {
    expect(mapApifyTaskConfig("Kced5aPs3hywm0ZTc")).toEqual({
      region: "phoenix_az",
      source: "facebook",
    });
    expect(mapApifyTaskConfig("gDNXUvm9UzjDSx9BJ")).toEqual({
      region: "kansas_city_mo",
      source: "facebook",
    });
    expect(mapApifyTaskConfig("emjfc12sHwqLFM3Aj")).toEqual({
      region: "minneapolis_mn",
      source: "facebook",
    });
  });

  it("maps the November 18 state tasks", () => {
    expect(mapApifyTaskConfig("d3cNGNGbW4D6wS57U")?.region).toBe("lincoln_ne");
    expect(mapApifyTaskConfig("uq2AtQs1BaHoCZlPt")?.region).toBe("denver_co");
    expect(mapApifyTaskConfig("9NaLFkeRAYdH8wiNd")?.region).toBe("salt_lake_city_ut");
    expect(mapApifyTaskConfig("dELGPpFDhebSJOzKM")?.region).toBe("chicago_il");
    expect(mapApifyTaskConfig("hJvDbRQjhevopk98o")?.region).toBe("louisville_ky");
    expect(mapApifyTaskConfig("gWbwoWm5SJGzxd6WS")?.region).toBe("nashville_tn");
    expect(mapApifyTaskConfig("aslBuJHHof3nltlSd")?.region).toBe("birmingham_al");
    expect(mapApifyTaskConfig("KzLJGSjYaQfmyCecE")?.region).toBe("jackson_ms");
    expect(mapApifyTaskConfig("zJI3kpcnesT7CdnBn")?.region).toBe("atlanta_ga");
    expect(mapApifyTaskConfig("mYOppAstlB03MMtmO")?.region).toBe("miami_fl");
    expect(mapApifyTaskConfig("odIEVqzsdDz49Ei5P")?.region).toBe("indianapolis_in");
    expect(mapApifyTaskConfig("QIaEAwAabwAtpEz1f")?.region).toBe("des_moines_ia");
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
        "9NaLFkeRAYdH8wiNd",
        "Kced5aPs3hywm0ZTc",
        "KzLJGSjYaQfmyCecE",
        "MWtcjZFWqJrnYChgp",
        "NMTFTt1C0aEnhEuY9",
        "QIaEAwAabwAtpEz1f",
        "UfFehLMz5zylHOxCS",
        "Xpq656NgueqfXDHvU",
        "ZQEsd3nHcLAs5kLwL",
        "aslBuJHHof3nltlSd",
        "d3cNGNGbW4D6wS57U",
        "dELGPpFDhebSJOzKM",
        "emjfc12sHwqLFM3Aj",
        "gDNXUvm9UzjDSx9BJ",
        "gWbwoWm5SJGzxd6WS",
        "hJvDbRQjhevopk98o",
        "mYOppAstlB03MMtmO",
        "nccVufFs2grLH4Qsj",
        "odIEVqzsdDz49Ei5P",
        "uq2AtQs1BaHoCZlPt",
        "vk7OijnAOOo8V1ekc",
        "zJI3kpcnesT7CdnBn",
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
