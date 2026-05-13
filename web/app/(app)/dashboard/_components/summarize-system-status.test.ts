import { describe, expect, it } from "vitest";

import type { SystemStatus } from "@/lib/app-api/schemas";
import {
  systemStatusDbDown,
  systemStatusHealthy,
  systemStatusNeverRun,
} from "@/test/msw/fixtures";

import { summarizeSystemStatus } from "./summarize-system-status";

describe("summarizeSystemStatus", () => {
  it("returns healthy / Operational when DB ok, intel routed, and staleSweep ran ok", () => {
    const r = summarizeSystemStatus(systemStatusHealthy);
    expect(r.status).toBe("healthy");
    expect(r.label).toMatch(/operational/i);
    expect(r.reasons).toEqual([]);
  });

  it("returns error / Database unavailable when db.ok is false", () => {
    const r = summarizeSystemStatus(systemStatusDbDown);
    expect(r.status).toBe("error");
    expect(r.label).toMatch(/database/i);
    expect(r.reasons).toContain("db_error");
  });

  it("returns review when staleSweep is never_run while DB is otherwise ok", () => {
    const r = summarizeSystemStatus(systemStatusNeverRun);
    expect(r.status).toBe("review");
    expect(r.reasons).toContain("stale_sweep_never_run");
  });

  it("returns review when staleSweep missingReason is db_error and DB is ok", () => {
    const data: SystemStatus = {
      ...systemStatusHealthy,
      staleSweep: { lastRunAt: null, missingReason: "db_error" },
    };
    const r = summarizeSystemStatus(data);
    expect(r.status).toBe("review");
    expect(r.reasons).toContain("stale_sweep_db_error");
  });

  it("returns review when staleSweep ran but reported status='failed' (stale-sweep regression)", () => {
    const data: SystemStatus = {
      ...systemStatusHealthy,
      staleSweep: { lastRunAt: "2026-05-12T06:00:00.000Z", status: "failed", updated: 0 },
    };
    const r = summarizeSystemStatus(data);
    expect(r.status).toBe("review");
    expect(r.reasons).toContain("stale_sweep_failed");
  });

  it("returns review when intel worker mode='worker' but neither bound nor URL routed", () => {
    const data: SystemStatus = {
      ...systemStatusHealthy,
      intelWorker: { mode: "worker", binding: false, url: null },
    };
    const r = summarizeSystemStatus(data);
    expect(r.status).toBe("review");
    expect(r.reasons).toContain("intel_worker_unrouted");
  });

  it("treats intel worker mode='direct' as healthy (in-worker Manheim path)", () => {
    const data: SystemStatus = {
      ...systemStatusHealthy,
      intelWorker: { mode: "direct", binding: false, url: null },
    };
    const r = summarizeSystemStatus(data);
    expect(r.status).toBe("healthy");
  });
});
