import { describe, expect, it } from "vitest";
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
});
