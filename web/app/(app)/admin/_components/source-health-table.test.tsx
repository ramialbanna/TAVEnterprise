import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { SystemStatus } from "@/lib/app-api/schemas";
import { SourceHealthTable } from "./source-health-table";

function makeStatus(partial: Partial<SystemStatus>): SystemStatus {
  return {
    service: "tav-aip",
    version: "test",
    timestamp: "2026-05-12T12:00:00.000Z",
    db: { ok: true },
    intelWorker: { mode: "worker", binding: true, url: "https://x.workers.dev" },
    sources: [],
    staleSweep: { lastRunAt: null, missingReason: "never_run" },
    ...partial,
  };
}

describe("SourceHealthTable", () => {
  it("renders a row from a v_source_health entry", () => {
    const data = makeStatus({
      sources: [
        {
          source: "facebook",
          region: "dallas_tx",
          run_id: "aEhX3Np1OQcmlOk4D",
          scraped_at: "2026-05-12T11:00:00.000Z",
          item_count: 7373,
          processed: 4242,
          rejected: 5858,
          created_leads: 12,
          status: "completed",
        },
      ],
    });
    render(<SourceHealthTable data={data} />);
    expect(screen.getByText("facebook")).toBeInTheDocument();
    expect(screen.getByText("dallas_tx")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("aEhX3Np1OQcmlOk4D")).toBeInTheDocument();
    expect(screen.getByText("4,242")).toBeInTheDocument();
    expect(screen.getByText("7,373")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders the unavailable empty state when db is down", () => {
    const data = makeStatus({ db: { ok: false, missingReason: "db_error" }, sources: [] });
    render(<SourceHealthTable data={data} />);
    expect(screen.getByText(/source health unavailable/i)).toBeInTheDocument();
  });

  it("renders the empty state when sources is [] but DB is up", () => {
    const data = makeStatus({ sources: [] });
    render(<SourceHealthTable data={data} />);
    expect(screen.getByText(/no source rows/i)).toBeInTheDocument();
  });

  it("renders only the defensive columns even when a row has extra keys", () => {
    const data = makeStatus({
      sources: [
        {
          source: "facebook",
          processed: 1,
          scraped_at: "2026-05-12T11:00:00.000Z",
          // Defensive: any extra column (e.g. service_role_key leak) must not appear.
          secret_value: "leaked-token-abc123",
        },
      ],
    });
    const { container } = render(<SourceHealthTable data={data} />);
    expect(container.textContent ?? "").not.toMatch(/leaked-token-abc123/);
    expect(container.textContent ?? "").not.toMatch(/secret_value/);
  });
});
