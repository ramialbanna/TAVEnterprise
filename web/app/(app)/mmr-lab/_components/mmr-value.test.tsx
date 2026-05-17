import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DASH, MmrMoney, MmrRange } from "./mmr-value";

describe("MmrMoney / MmrRange — honest empty", () => {
  it("DASH is the two-hyphen token (Issue #44, not the em-dash)", () => {
    expect(DASH).toBe("--");
  });

  it("renders -- when value is null/undefined", () => {
    const { rerender } = render(<MmrMoney value={null} />);
    expect(screen.getByText("--")).toBeInTheDocument();
    rerender(<MmrMoney value={undefined} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("formats a number as USD without cents", () => {
    render(<MmrMoney value={48600} />);
    expect(screen.getByText("$48,600")).toBeInTheDocument();
  });

  it("renders $0 for a real zero (not collapsed to --)", () => {
    render(<MmrMoney value={0} />);
    expect(screen.getByText("$0")).toBeInTheDocument();
  });

  it("renders -- for NaN (never the em-dash from formatMoney)", () => {
    render(<MmrMoney value={NaN} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("range renders -- when either bound missing", () => {
    const { rerender } = render(<MmrRange low={null} high={51600} />);
    expect(screen.getByText("--")).toBeInTheDocument();
    rerender(<MmrRange low={45800} high={null} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("range formats both bounds", () => {
    render(<MmrRange low={45800} high={51600} />);
    expect(screen.getByText("$45,800 - $51,600")).toBeInTheDocument();
  });
});
