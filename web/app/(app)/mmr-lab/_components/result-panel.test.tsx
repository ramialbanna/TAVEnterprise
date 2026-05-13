import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { ApiResult } from "@/lib/app-api";
import type { MmrVinOk } from "@/lib/app-api/schemas";

import { ResultPanel } from "./result-panel";

const OK_RESULT: ApiResult<MmrVinOk> = {
  ok: true,
  data: { mmrValue: 68600, confidence: "high", method: "vin" },
  status: 200,
};

const LOOKED_UP_AT = "2026-05-12T15:30:00.000Z";

describe("ResultPanel", () => {
  it("renders MMR, confidence, method, spread, and Strong Buy recommendation for asking 62000", () => {
    render(
      <ResultPanel result={OK_RESULT} askingPrice={62000} lookedUpAt={LOOKED_UP_AT} />,
    );

    // MMR + confidence + method + heuristic disclosure.
    expect(screen.getByText("$68,600")).toBeInTheDocument();
    expect(screen.getByText(/^high$/i)).toBeInTheDocument();
    expect(screen.getByText(/VIN match/i)).toBeInTheDocument();
    expect(screen.getByText(/heuristic — not the production buy-box score/i)).toBeInTheDocument();

    // Spread + recommendation.
    expect(screen.getByText(/headroom/i)).toBeInTheDocument();
    expect(screen.getByText("$6,600")).toBeInTheDocument();
    expect(screen.getByText("Strong Buy")).toBeInTheDocument();
  });

  it("renders an overpriced spread + Pass recommendation when asking exceeds MMR", () => {
    render(
      <ResultPanel result={OK_RESULT} askingPrice={71000} lookedUpAt={LOOKED_UP_AT} />,
    );
    expect(screen.getByText(/overpriced by/i)).toBeInTheDocument();
    expect(screen.getByText("$2,400")).toBeInTheDocument();
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("prompts for an asking price and shows '—' for recommendation when none is provided", () => {
    render(
      <ResultPanel result={OK_RESULT} askingPrice={null} lookedUpAt={LOOKED_UP_AT} />,
    );
    expect(
      screen.getByText(/Enter an asking price for a spread & recommendation\./i),
    ).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Strong Buy")).toBeNull();
    expect(screen.queryByText("Pass")).toBeNull();
  });

  it("renders Year/Make/Model/Trim as PendingBackendState (no fabricated identity fields)", () => {
    render(<ResultPanel result={OK_RESULT} askingPrice={null} lookedUpAt={LOOKED_UP_AT} />);
    // Each pending tile renders an inline "Pending backend" badge with the field name
    // in its tooltip.
    expect(screen.getAllByText(/^Pending backend$/i).length).toBeGreaterThanOrEqual(4);
  });

  it("collapses raw payload by default and exposes it on expand", () => {
    const { container } = render(
      <ResultPanel result={OK_RESULT} askingPrice={null} lookedUpAt={LOOKED_UP_AT} />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    if (!details) return;
    expect(details.open).toBe(false);
    // Toggle and confirm the JSON body is now visible.
    details.open = true;
    const pre = details.querySelector("pre");
    expect(pre?.textContent ?? "").toContain('"mmrValue": 68600');
    expect(pre?.textContent ?? "").toContain('"confidence": "high"');
  });

  it("renders UnavailableState + Retry for an `unavailable`-kind ApiResult", () => {
    const onRetry = vi.fn();
    render(
      <ResultPanel
        result={{
          ok: false,
          kind: "unavailable",
          error: "intel_worker_timeout",
          status: 503,
          message: "The MMR service timed out — try again.",
        }}
        askingPrice={null}
        lookedUpAt={LOOKED_UP_AT}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(/Lookup unavailable/i)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /retry lookup/i });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // No alert (UnavailableState is muted, not an error).
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders ErrorState + issues + NO retry for an `invalid` ApiResult", () => {
    const onRetry = vi.fn();
    render(
      <ResultPanel
        result={{
          ok: false,
          kind: "invalid",
          error: "invalid_body",
          status: 400,
          message: "That request was rejected — check the highlighted fields.",
          issues: [{ path: ["vin"], message: "VIN must be at least 11 characters" }],
        }}
        askingPrice={null}
        lookedUpAt={LOOKED_UP_AT}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Issue summary rendered.
    const alertRegion = screen.getByRole("alert");
    expect(within(alertRegion.parentElement!).getByText(/vin/i)).toBeInTheDocument();
    // ErrorState enforces isRetryableError — `invalid` is NOT retryable.
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("renders the placeholder when result is null (no lookup yet)", () => {
    render(<ResultPanel result={null} askingPrice={null} lookedUpAt={null} />);
    expect(
      screen.getByText(/Run a VIN lookup to see the Cox MMR value/i),
    ).toBeInTheDocument();
  });
});
