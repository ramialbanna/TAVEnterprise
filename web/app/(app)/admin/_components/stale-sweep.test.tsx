import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { SystemStatus } from "@/lib/app-api/schemas";
import { StaleSweep } from "./stale-sweep";

describe("StaleSweep", () => {
  it("renders OK + last run + updated count when the sweep succeeded", () => {
    const data: SystemStatus["staleSweep"] = {
      lastRunAt: "2026-05-12T06:00:00.000Z",
      status: "ok",
      updated: 7,
    };
    render(<StaleSweep data={data} />);
    expect(screen.getByText(/^OK$/)).toBeInTheDocument();
    expect(screen.getByText(/last run/i)).toBeInTheDocument();
    expect(screen.getByText(/7 updated/i)).toBeInTheDocument();
  });

  it("renders Failed when status is failed", () => {
    const data: SystemStatus["staleSweep"] = {
      lastRunAt: "2026-05-12T06:00:00.000Z",
      status: "failed",
      updated: null,
    };
    render(<StaleSweep data={data} />);
    expect(screen.getByText(/^Failed$/)).toBeInTheDocument();
  });

  it("renders 'Never run' for never_run missingReason", () => {
    const data: SystemStatus["staleSweep"] = {
      lastRunAt: null,
      missingReason: "never_run",
    };
    render(<StaleSweep data={data} />);
    expect(screen.getByText(/never run/i)).toBeInTheDocument();
    expect(screen.getByText(/hasn't run yet/i)).toBeInTheDocument();
  });

  it("renders 'Unavailable' for db_error missingReason", () => {
    const data: SystemStatus["staleSweep"] = {
      lastRunAt: null,
      missingReason: "db_error",
    };
    render(<StaleSweep data={data} />);
    // "Unavailable" appears both in the pill and the codeMessage rationale.
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });
});
