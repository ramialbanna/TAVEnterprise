import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { OpportunitiesPageIntro } from "./opportunities-page-intro";

describe("OpportunitiesPageIntro", () => {
  it("shows New mode copy", () => {
    render(<OpportunitiesPageIntro />);
    expect(screen.getByRole("heading", { name: "Opportunities" })).toBeInTheDocument();
    expect(screen.queryByText(/Compare asking price to MMR/)).not.toBeInTheDocument();
  });
});
