import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { BarChartCard } from "./bar-chart-card";

// Recharts' ResponsiveContainer uses ResizeObserver, which jsdom doesn't provide.
// A no-op shim lets the component tree render in tests (the SVG stays 0×0, which is
// fine — the assertions target the title, the state messages, and the sr-only table).
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const data = [
  { label: "TX-East", value: 1200 },
  { label: "TX-West", value: 900 },
];

describe("BarChartCard", () => {
  it("renders the title and the category labels via the sr-only data table", () => {
    render(<BarChartCard title="Gross by region" data={data} valueLabel="Gross" categoryLabel="Region" />);
    expect(screen.getByText("Gross by region")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("TX-East")).toBeInTheDocument();
    expect(within(table).getByText("TX-West")).toBeInTheDocument();
    expect(within(table).getByText("1200")).toBeInTheDocument();
  });

  it("renders a 'No data' empty state — not an empty chart frame — for data=[]", () => {
    render(<BarChartCard title="Gross by region" data={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders a 'Not enough data' state when data.length < minPoints", () => {
    render(<BarChartCard title="Gross by region" data={[{ label: "TX-East", value: 1200 }]} minPoints={2} />);
    expect(screen.getByText(/not enough data/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
