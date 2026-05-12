import { describe, expect, it } from "vitest";
import {
  SYSTEM_STATUS_REFETCH_MS,
  isRetryableError,
  makeQueryClient,
  queryKeys,
  shouldRetryQuery,
} from "./query";

describe("queryKeys", () => {
  it("exposes stable keys", () => {
    expect(queryKeys.systemStatus).toEqual(["system-status"]);
    expect(queryKeys.kpis).toEqual(["kpis"]);
    expect(queryKeys.importBatches()).toEqual(["import-batches", null]);
    expect(queryKeys.importBatches(10)).toEqual(["import-batches", 10]);
    expect(queryKeys.historicalSales()).toEqual(["historical-sales", {}]);
    expect(queryKeys.historicalSales({ year: 2026, make: "Ford" })).toEqual([
      "historical-sales",
      { year: 2026, make: "Ford" },
    ]);
  });
});

describe("isRetryableError", () => {
  it("retries transient ApiResult kinds", () => {
    expect(isRetryableError({ ok: false, kind: "unavailable", error: "db_error" })).toBe(true);
    expect(isRetryableError({ ok: false, kind: "proxy", error: "client_fetch_failed" })).toBe(true);
  });
  it("does not retry terminal ApiResult kinds", () => {
    expect(isRetryableError({ ok: false, kind: "unauthorized", error: "unauthorized" })).toBe(false);
    expect(isRetryableError({ ok: false, kind: "invalid", error: "schema_mismatch" })).toBe(false);
  });
  it("treats unknown throws as transient", () => {
    expect(isRetryableError(new Error("boom"))).toBe(true);
    expect(isRetryableError("weird")).toBe(true);
    expect(isRetryableError(undefined)).toBe(true);
  });
});

describe("shouldRetryQuery", () => {
  it("caps retries at 2 and respects retryability", () => {
    const transient = new Error("net");
    expect(shouldRetryQuery(0, transient)).toBe(true);
    expect(shouldRetryQuery(1, transient)).toBe(true);
    expect(shouldRetryQuery(2, transient)).toBe(false);
    expect(shouldRetryQuery(0, { ok: false, kind: "unauthorized", error: "unauthorized" })).toBe(false);
  });
});

describe("makeQueryClient", () => {
  it("applies dashboard query defaults", () => {
    const qc = makeQueryClient();
    const defaults = qc.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.retry).toBe(shouldRetryQuery);
    expect(defaults.mutations?.retry).toBe(false);
  });
  it("returns a fresh instance each call", () => {
    expect(makeQueryClient()).not.toBe(makeQueryClient());
  });
});

describe("constants", () => {
  it("system-status refetch interval", () => {
    expect(SYSTEM_STATUS_REFETCH_MS).toBe(30_000);
  });
});
