import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SearchPanel,
  parseLaneAskPrice,
  type MmrCatalogOptions,
  type MmrSelection,
} from "./search-panel";

const emptySelection: MmrSelection = {
  year: "",
  make: "",
  model: "",
  style: "",
};

const connectedCatalog: MmrCatalogOptions = {
  years: ["2026", "2025"],
  makes: ["TESLA"],
  models: ["MODEL Y AWD"],
  styles: ["4D SUV PERFORMANCE"],
  catalogState: "connected",
  reason: null,
  loading: null,
};

function renderPanel(
  overrides: Partial<{
    vin: string;
    onVinChange: (value: string) => void;
    vinReadOnly: boolean;
    onVinReset: () => void;
    selection: MmrSelection;
    catalog: MmrCatalogOptions;
    onSelectionChange: (next: MmrSelection) => void;
    onYmmSubmit: () => void;
    laneAskPrice: string;
    onLaneAskPriceChange: (value: string) => void;
  }> = {},
) {
  const props = {
    vin: overrides.vin ?? "",
    onVinChange: overrides.onVinChange ?? vi.fn(),
    vinReadOnly: overrides.vinReadOnly ?? false,
    onVinReset: overrides.onVinReset,
    onVinSubmit: vi.fn(),
    vinPending: false,
    selection: overrides.selection ?? emptySelection,
    catalog: overrides.catalog ?? connectedCatalog,
    onSelectionChange: overrides.onSelectionChange ?? vi.fn(),
    onYmmSubmit: overrides.onYmmSubmit ?? vi.fn(),
    ymmPending: false,
    laneAskPrice: overrides.laneAskPrice ?? "",
    onLaneAskPriceChange: overrides.onLaneAskPriceChange ?? vi.fn(),
  };
  render(<SearchPanel {...props} />);
  return props;
}

describe("SearchPanel — live catalog + VIN", () => {
  it("VIN submit fires only for an 11-17 char VIN", () => {
    const onVinSubmit = vi.fn();
    const { rerender } = render(
      <SearchPanel
        vin="SHORT"
        onVinChange={vi.fn()}
        onVinSubmit={onVinSubmit}
        vinPending={false}
        selection={emptySelection}
        catalog={connectedCatalog}
        onSelectionChange={vi.fn()}
        onYmmSubmit={vi.fn()}
        ymmPending={false}
        laneAskPrice=""
        onLaneAskPriceChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onVinSubmit).not.toHaveBeenCalled();

    rerender(
      <SearchPanel
        vin="1FT7W2BT4KED81759"
        onVinChange={vi.fn()}
        onVinSubmit={onVinSubmit}
        vinPending={false}
        selection={emptySelection}
        catalog={connectedCatalog}
        onSelectionChange={vi.fn()}
        onYmmSubmit={vi.fn()}
        ymmPending={false}
        laneAskPrice=""
        onLaneAskPriceChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(onVinSubmit).toHaveBeenCalledWith("1FT7W2BT4KED81759");
  });

  it("read-only VIN shows Change VIN and calls onVinReset", () => {
    const onVinReset = vi.fn();
    renderPanel({ vin: "1FT7W2BT4KED81759", vinReadOnly: true, onVinReset });
    expect(screen.getByPlaceholderText(/enter vin/i)).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: /change vin/i }));
    expect(onVinReset).toHaveBeenCalledTimes(1);
  });

  it("renders catalog options from props, not local constants", () => {
    renderPanel();
    const year = screen.getByLabelText(/year/i);
    expect(within(year).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Year",
      "2026",
      "2025",
    ]);
    expect(screen.getByLabelText(/make/i)).toBeDisabled();
  });

  it("does not render a Miles input in the search panel", () => {
    renderPanel();
    expect(screen.queryByLabelText(/mileage/i)).not.toBeInTheDocument();
  });

  it("enables the cascade as upstream selections exist", () => {
    renderPanel({
      selection: {
        year: "2026",
        make: "TESLA",
        model: "MODEL Y AWD",
        style: "",
      },
    });
    expect(screen.getByLabelText(/year/i)).toBeEnabled();
    expect(screen.getByLabelText(/make/i)).toBeEnabled();
    expect(screen.getByLabelText(/model/i)).toBeEnabled();
    expect(screen.getByLabelText(/style/i)).toBeEnabled();
  });

  it("forwards field edits to the parent without applying cascade locally", () => {
    const onSelectionChange = vi.fn();
    renderPanel({
      selection: {
        year: "2026",
        make: "TESLA",
        model: "MODEL Y AWD",
        style: "4D SUV PERFORMANCE",
      },
      onSelectionChange,
    });
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "" } });
    expect(onSelectionChange).toHaveBeenCalledWith({
      year: "2026",
      make: "",
      model: "MODEL Y AWD",
      style: "4D SUV PERFORMANCE",
    });
    fireEvent.change(screen.getByLabelText(/year/i), { target: { value: "2025" } });
    expect(onSelectionChange).toHaveBeenLastCalledWith({
      year: "2025",
      make: "TESLA",
      model: "MODEL Y AWD",
      style: "4D SUV PERFORMANCE",
    });
  });

  it("YMM valuation requires style only", () => {
    const onYmmSubmit = vi.fn();
    const { rerender } = render(
      <SearchPanel
        vin=""
        onVinChange={vi.fn()}
        onVinSubmit={vi.fn()}
        vinPending={false}
        selection={{ ...emptySelection, year: "2026", make: "TESLA", model: "MODEL Y AWD" }}
        catalog={connectedCatalog}
        onSelectionChange={vi.fn()}
        onYmmSubmit={onYmmSubmit}
        ymmPending={false}
        laneAskPrice=""
        onLaneAskPriceChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /value selected vehicle/i })).toBeDisabled();

    rerender(
      <SearchPanel
        vin=""
        onVinChange={vi.fn()}
        onVinSubmit={vi.fn()}
        vinPending={false}
        selection={{
          year: "2026",
          make: "TESLA",
          model: "MODEL Y AWD",
          style: "4D SUV PERFORMANCE",
        }}
        catalog={connectedCatalog}
        onSelectionChange={vi.fn()}
        onYmmSubmit={onYmmSubmit}
        ymmPending={false}
        laneAskPrice=""
        onLaneAskPriceChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /value selected vehicle/i }));
    expect(onYmmSubmit).toHaveBeenCalledTimes(1);
  });

  it("not-connected catalog disables selectors without injecting samples", () => {
    renderPanel({
      catalog: {
        ...connectedCatalog,
        years: [],
        makes: [],
        models: [],
        styles: [],
        catalogState: "not_connected",
        reason: "not_provisioned",
      },
    });
    for (const label of [/year/i, /make/i, /model/i, /style/i]) {
      const sel = screen.getByLabelText(label);
      expect(sel).toBeDisabled();
      expect(within(sel).getAllByRole("option")).toHaveLength(1);
    }
    expect(screen.getByText(/live catalog not connected/i)).toBeInTheDocument();
  });

  it("lane ask price is optional and forwards digits-only changes", () => {
    const onLaneAskPriceChange = vi.fn();
    renderPanel({ onLaneAskPriceChange });
    expect(screen.getByLabelText(/lane ask price/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/lane ask price/i), {
      target: { value: "$21,500" },
    });
    expect(onLaneAskPriceChange).toHaveBeenCalledWith("21500");
  });
});

describe("parseLaneAskPrice", () => {
  it("returns null for empty or invalid values", () => {
    expect(parseLaneAskPrice("")).toBeNull();
    expect(parseLaneAskPrice("0")).toBeNull();
    expect(parseLaneAskPrice("abc")).toBeNull();
  });

  it("parses positive integers", () => {
    expect(parseLaneAskPrice("21500")).toBe(21500);
    expect(parseLaneAskPrice(" 21500 ")).toBe(21500);
  });
});
