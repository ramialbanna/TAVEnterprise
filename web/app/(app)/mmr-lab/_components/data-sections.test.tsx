import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataSections } from "./data-sections";
import { HistoricalProjected } from "./historical-projected";
import { lowerSectionStateFromView, lowerSectionsFromView } from "./mmr-lower-section-state";
import { TX_COLUMNS, TransactionsTable } from "./transactions-table";

describe("lowerSectionStateFromView", () => {
  it("maps MMR view kinds to section phases", () => {
    expect(lowerSectionStateFromView("empty")).toBe("idle");
    expect(lowerSectionStateFromView("loading")).toBe("loading");
    expect(lowerSectionStateFromView("ok")).toBe("ready");
    expect(lowerSectionStateFromView("unavailable")).toBe("ready");
    expect(lowerSectionStateFromView("error")).toBe("idle");
  });
});

describe("lowerSectionsFromView", () => {
  it("passes market context when MMR is ok", () => {
    const state = lowerSectionsFromView("ok", {
      historicalAverages: {
        past30Days: { price: 18900, avgMileage: 65563 },
        sixMonthsAgo: null,
        lastYear: null,
      },
      projectedAverage: { price: 19100, avgMileage: null },
      transactions: [],
    });
    expect(state).toEqual({
      phase: "ready",
      market: {
        historicalAverages: {
          past30Days: { price: 18900, avgMileage: 65563 },
          sixMonthsAgo: null,
          lastYear: null,
        },
        projectedAverage: { price: 19100, avgMileage: null },
        transactions: [],
      },
    });
  });
});

describe("DataSections — Zones C2/C3", () => {
  it("does not render Similar vehicles", () => {
    render(<DataSections />);
    expect(screen.queryByText(/similar vehicles/i)).not.toBeInTheDocument();
  });

  it("idle shows search prompts", () => {
    render(<DataSections state={{ phase: "idle" }} />);
    expect(screen.getByRole("heading", { name: /manheim transactions/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /historical average/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /projected average/i })).toBeInTheDocument();
    expect(screen.getByText(/search to load manheim wholesale auction sale comps/i)).toBeInTheDocument();
  });

  it("ready shows live historical values when present", () => {
    render(
      <DataSections
        state={{
          phase: "ready",
          market: {
            historicalAverages: {
              past30Days: { price: 18900, avgMileage: 65563 },
              sixMonthsAgo: { price: 18250, avgMileage: 57567 },
              lastYear: { price: 21900, avgMileage: 51440 },
            },
            projectedAverage: { price: 19100, avgMileage: null },
            transactions: [{
              date: "2026-04-15",
              price: 18750,
              odometer: 64200,
              grade: "4.2",
              evbh: null,
              engineTrans: null,
              exteriorColor: null,
              type: null,
              region: "Southeast",
              auction: "Manheim Atlanta",
            }],
          },
        }}
      />,
    );
    expect(screen.getByText("$18,900")).toBeInTheDocument();
    expect(screen.getByText("$19,100")).toBeInTheDocument();
    expect(screen.getByText("65,563 mi")).toBeInTheDocument();
    expect(screen.getByText("Southeast")).toBeInTheDocument();
    expect(screen.getByText("Manheim Atlanta")).toBeInTheDocument();
    for (const c of TX_COLUMNS) {
      expect(screen.getByText(c)).toBeInTheDocument();
    }
  });

  it("ready without transactions shows empty comps message", () => {
    render(
      <DataSections
        state={{
          phase: "ready",
          market: {
            historicalAverages: null,
            projectedAverage: null,
            transactions: [],
          },
        }}
      />,
    );
    expect(screen.getByText(/no manheim wholesale auction sale comps returned/i)).toBeInTheDocument();
  });
});

describe("TransactionsTable", () => {
  it("loading marks section busy", () => {
    render(<TransactionsTable phase="loading" />);
    const section = screen.getByText(/manheim transactions/i).closest("section");
    expect(section).toHaveAttribute("aria-busy", "true");
  });
});

describe("HistoricalProjected", () => {
  it("ready renders historical and projected slot labels with values", () => {
    render(
      <HistoricalProjected
        phase="ready"
        historicalAverages={{
          past30Days: { price: 18900, avgMileage: 65563 },
          sixMonthsAgo: null,
          lastYear: null,
        }}
        projectedAverage={{ price: 19100, avgMileage: null }}
      />,
    );
    for (const s of ["Past 30 Days", "6 Months Ago", "Last Year", "Next Month"]) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
    expect(screen.getByText("$18,900")).toBeInTheDocument();
    expect(screen.getByText("$19,100")).toBeInTheDocument();
  });
});
