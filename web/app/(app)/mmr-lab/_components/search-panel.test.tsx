import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SearchPanel,
  type MmrCatalogOptions,
  type MmrSelection,
} from "./search-panel";

const emptySelection: MmrSelection = {
  year: "",
  make: "",
  model: "",
  style: "",
  mileage: "",
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
    selection: MmrSelection;
    catalog: MmrCatalogOptions;
    onSelectionChange: (next: MmrSelection) => void;
    onYmmSubmit: () => void;
  }> = {},
) {
  const props = {
    onVinSubmit: vi.fn(),
    vinPending: false,
    selection: overrides.selection ?? emptySelection,
    catalog: overrides.catalog ?? connectedCatalog,
    onSelectionChange: overrides.onSelectionChange ?? vi.fn(),
    onYmmSubmit: overrides.onYmmSubmit ?? vi.fn(),
    ymmPending: false,
  };
  render(<SearchPanel {...props} />);
  return props;
}

describe("SearchPanel — live catalog + VIN", () => {
  it("VIN submit fires only for an 11-17 char VIN", () => {
    const props = renderPanel();
    const vin = screen.getByPlaceholderText(/enter vin/i);
    fireEvent.change(vin, { target: { value: "SHORT" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(props.onVinSubmit).not.toHaveBeenCalled();
    fireEvent.change(vin, { target: { value: "1FT7W2BT4KED81759" } });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(props.onVinSubmit).toHaveBeenCalledWith("1FT7W2BT4KED81759");
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

  it("enables the cascade as upstream selections exist", () => {
    renderPanel({
      selection: {
        year: "2026",
        make: "TESLA",
        model: "MODEL Y AWD",
        style: "",
        mileage: "",
      },
    });
    expect(screen.getByLabelText(/year/i)).toBeEnabled();
    expect(screen.getByLabelText(/make/i)).toBeEnabled();
    expect(screen.getByLabelText(/model/i)).toBeEnabled();
    expect(screen.getByLabelText(/style/i)).toBeEnabled();
  });

  it("selection changes clear downstream values before the parent callback", () => {
    const onSelectionChange = vi.fn();
    renderPanel({
      selection: {
        year: "2026",
        make: "TESLA",
        model: "MODEL Y AWD",
        style: "4D SUV PERFORMANCE",
        mileage: "70740",
      },
      onSelectionChange,
    });
    fireEvent.change(screen.getByLabelText(/make/i), { target: { value: "" } });
    expect(onSelectionChange).toHaveBeenCalledWith({
      year: "2026",
      make: "",
      model: "",
      style: "",
      mileage: "70740",
    });
  });

  it("YMM valuation requires style and mileage", () => {
    const onYmmSubmit = vi.fn();
    const { rerender } = render(
      <SearchPanel
        onVinSubmit={vi.fn()}
        vinPending={false}
        selection={{ ...emptySelection, year: "2026", make: "TESLA", model: "MODEL Y AWD" }}
        catalog={connectedCatalog}
        onSelectionChange={vi.fn()}
        onYmmSubmit={onYmmSubmit}
        ymmPending={false}
      />,
    );
    expect(screen.getByRole("button", { name: /value selected vehicle/i })).toBeDisabled();

    rerender(
      <SearchPanel
        onVinSubmit={vi.fn()}
        vinPending={false}
        selection={{
          year: "2026",
          make: "TESLA",
          model: "MODEL Y AWD",
          style: "4D SUV PERFORMANCE",
          mileage: "70740",
        }}
        catalog={connectedCatalog}
        onSelectionChange={vi.fn()}
        onYmmSubmit={onYmmSubmit}
        ymmPending={false}
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
});
