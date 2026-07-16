import { describe, it, expect, vi, beforeEach } from "vitest";

import type { Env } from "../../types/env";

vi.mock("../intelCatalogClient", () => ({
  buildCoxCatalogYearRange: vi.fn(() => [2020]),
  buildIntelCatalogPath: vi.fn(
    (year: number, make?: string, model?: string) =>
      `/catalog/${year}/${make ?? ""}/${model ?? ""}`,
  ),
  fetchIntelCatalogItems: vi.fn(),
}));

vi.mock("../../persistence/coxCatalogTree", () => ({
  startCoxCatalogSyncRun: vi.fn().mockResolvedValue("run-1"),
  finishCoxCatalogSyncRun: vi.fn().mockResolvedValue(undefined),
  upsertCoxCatalogTreeRows: vi.fn().mockResolvedValue(1),
}));

import { fetchIntelCatalogItems } from "../intelCatalogClient";
import { finishCoxCatalogSyncRun, upsertCoxCatalogTreeRows } from "../../persistence/coxCatalogTree";
import { runCoxCatalogSync } from "../syncCoxCatalogTree";

const env = {} as Env;
const db = { __fake: "db" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchIntelCatalogItems).mockImplementation(async (_env, path) => {
    if (path.endsWith("/Toyota/")) return ["Camry"];
    if (path.endsWith("/Toyota/Camry")) return ["4D Sedan SE"];
    if (path.endsWith("/2020//")) return ["Toyota"];
    return [];
  });
  vi.mocked(upsertCoxCatalogTreeRows).mockResolvedValue(1);
});

describe("runCoxCatalogSync", () => {
  it("fetches catalog per year/make/model and upserts styles", async () => {
    const result = await runCoxCatalogSync(env, db);

    expect(result).toEqual({
      runId: "run-1",
      status: "completed",
      yearsSynced: [2020],
      rowCount: 1,
      skippedModels: 0,
    });
    expect(upsertCoxCatalogTreeRows).toHaveBeenCalledWith(db, [
      { year: 2020, make: "Toyota", model: "Camry", style: "4D Sedan SE" },
    ]);
    expect(finishCoxCatalogSyncRun).toHaveBeenCalledWith(
      db,
      "run-1",
      expect.objectContaining({ status: "completed", rowCount: 1 }),
    );
  });

  it("records partial progress when a fetch fails mid-run", async () => {
    vi.mocked(fetchIntelCatalogItems).mockRejectedValueOnce(new Error("HTTP 503"));

    await expect(runCoxCatalogSync(env, db)).rejects.toThrow("HTTP 503");

    expect(finishCoxCatalogSyncRun).toHaveBeenCalledWith(
      db,
      "run-1",
      expect.objectContaining({ status: "failed", rowCount: 0 }),
    );
  });
});
