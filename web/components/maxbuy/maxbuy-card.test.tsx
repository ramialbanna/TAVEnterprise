import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { MaxBuyCard } from "./maxbuy-card";

describe("MaxBuyCard", () => {
  it("renders disabled shell with coming soon", () => {
    render(<MaxBuyCard mode="disabled" />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run max buy/i })).toBeDisabled();
  });

  it("renders awaiting VIN message on embedded deals", () => {
    render(<MaxBuyCard mode="awaiting_vin" variant="embedded" />);
    expect(screen.getByText(/add a vin/i)).toBeInTheDocument();
  });
});
