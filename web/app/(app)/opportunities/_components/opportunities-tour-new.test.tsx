import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OPPORTUNITIES_TOUR_STORAGE_KEY } from "@/lib/opportunities/opportunities-tour";

import { OpportunitiesTourNew } from "./opportunities-tour-new";

beforeEach(() => {
  window.localStorage.clear();
});

describe("OpportunitiesTourNew", () => {
  it("renders when not dismissed", () => {
    render(<OpportunitiesTourNew />);
    expect(screen.getByRole("heading", { name: "Quick start" })).toBeInTheDocument();
    expect(screen.getByText(/1\.\s*Submit a listing/)).toBeInTheDocument();
  });

  it("dismisses and persists", async () => {
    const user = userEvent.setup();
    render(<OpportunitiesTourNew />);
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(window.localStorage.getItem(OPPORTUNITIES_TOUR_STORAGE_KEY)).toBe("1");
    expect(screen.queryByRole("heading", { name: "Quick start" })).not.toBeInTheDocument();
  });
});
