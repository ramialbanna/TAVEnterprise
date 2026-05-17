import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataSections } from "./data-sections";

describe("DataSections — frames render, bodies honest-empty", () => {
  it("renders the four section headers", () => {
    render(<DataSections />);
    expect(screen.getByText(/similar vehicles/i)).toBeInTheDocument();
    expect(screen.getByText(/transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/historical average/i)).toBeInTheDocument();
    expect(screen.getByText(/projected average/i)).toBeInTheDocument();
  });

  it("transactions has the Manheim columns and no data rows", () => {
    render(<DataSections />);
    for (const c of [
      "Date",
      "Price",
      "Odo (mi)",
      "Grade",
      "EVBH",
      "Eng/T",
      "Ext Color",
      "Type",
      "Region",
      "Auction",
    ]) {
      expect(screen.getByText(c)).toBeInTheDocument();
    }
    expect(screen.queryByRole("row", { name: /\$/ })).not.toBeInTheDocument();
  });

  it("historical/projected slots all render --", () => {
    render(<DataSections />);
    for (const s of ["Past 30 Days", "6 Months Ago", "Last Year", "Next Month"]) {
      expect(screen.getByText(s)).toBeInTheDocument();
    }
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(4);
  });
});
