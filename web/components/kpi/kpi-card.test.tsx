import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { KpiCard } from "./kpi-card";

describe("KpiCard", () => {
  it("formats a numeric value as money by default", () => {
    render(<KpiCard label="Avg gross" value={1500} />);
    expect(screen.getByText("$1,500")).toBeInTheDocument();
  });

  it("renders a 'Not available' marker — not a zero — for a null value", () => {
    render(<KpiCard label="Avg gross" value={null} />);
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("renders the pending-backend marker when state='pending'", () => {
    render(<KpiCard label="Sell-through rate" state="pending" />);
    expect(screen.getByText(/pending backend/i)).toBeInTheDocument();
  });

  it("renders the unavailable marker when state='unavailable'", () => {
    render(<KpiCard label="Avg gross" state="unavailable" reason="db_error" />);
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });

  it("shows the trend badge", () => {
    render(<KpiCard label="Avg gross" value={1500} trend={{ dir: "up", text: "+12% vs last month" }} />);
    expect(screen.getByText("+12% vs last month")).toBeInTheDocument();
  });

  it("supports the number format", () => {
    render(<KpiCard label="Leads" value={42} format="number" />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("supports the percent format (decimal ratio)", () => {
    render(<KpiCard label="Rate" value={0.42} format="percent" />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("respects digits={1} for format='number' (e.g. avg hold days)", () => {
    render(<KpiCard label="Avg hold days" value={21.5} format="number" digits={1} />);
    expect(screen.getByText("21.5")).toBeInTheDocument();
  });

  it("renders a relative time for format='relativeDate' with a valid ISO timestamp", () => {
    const now = new Date("2026-05-12T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      render(<KpiCard label="Last outcome at" value="2026-05-10T12:00:00.000Z" format="relativeDate" />);
      // Intl.RelativeTimeFormat numeric:"auto" → "2 days ago" for a 2-day delta.
      expect(screen.getByText(/days? ago|yesterday/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders 'Not available' (not the em-dash) when format='relativeDate' receives an unparseable string", () => {
    const { container } = render(
      <KpiCard label="Last outcome at" value="not-a-date" format="relativeDate" />,
    );
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
    // The em-dash sentinel from format.ts must not leak into the value slot.
    const valueNode = container.querySelector("p.tabular-nums");
    expect(valueNode).toBeNull();
  });

  it("accepts a Date instance for format='relativeDate'", () => {
    const now = new Date("2026-05-12T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      render(<KpiCard label="Last outcome at" value={tenMinutesAgo} format="relativeDate" />);
      expect(screen.getByText(/minutes? ago/i)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
