import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataSections } from "./data-sections";
import { HistoricalProjected } from "./historical-projected";
import { lowerSectionStateFromView } from "./mmr-lower-section-state";
import { TX_COLUMNS, TransactionsTable } from "./transactions-table";

describe("lowerSectionStateFromView", () => {
  it("maps MMR view kinds to section states", () => {
    expect(lowerSectionStateFromView("empty")).toBe("idle");
    expect(lowerSectionStateFromView("loading")).toBe("loading");
    expect(lowerSectionStateFromView("ok")).toBe("empty");
    expect(lowerSectionStateFromView("unavailable")).toBe("empty");
    expect(lowerSectionStateFromView("error")).toBe("idle");
  });
});

describe("DataSections — Zones C2/C3", () => {
  it("does not render Similar vehicles", () => {
    render(<DataSections />);
    expect(screen.queryByText(/similar vehicles/i)).not.toBeInTheDocument();
  });

  it("idle shows search prompts", () => {
    render(<DataSections state="idle" />);
    expect(screen.getByRole("heading", { name: /transactions/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /historical average/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /projected average/i })).toBeInTheDocument();
    expect(screen.getByText(/search to load wholesale auction transaction comps/i)).toBeInTheDocument();
  });

  it("empty shows Cox columns and placeholder rows", () => {
    render(<DataSections state="empty" />);
    for (const c of TX_COLUMNS) {
      expect(screen.getByText(c)).toBeInTheDocument();
    }
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText(/avg mi/i).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/swipe horizontally/i)).toBeInTheDocument();
  });
});

describe("TransactionsTable", () => {
  it("loading marks section busy", () => {
    render(<TransactionsTable state="loading" />);
    const section = screen.getByText(/transactions/i).closest("section");
    expect(section).toHaveAttribute("aria-busy", "true");
  });
});

describe("HistoricalProjected", () => {
  it("empty renders historical and projected slot labels", () => {
    render(<HistoricalProjected state="empty" />);
    for (const s of ["Past 30 Days", "6 Months Ago", "Last Year", "Next Month"]) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
  });
});
