import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { OpportunitySellerNotesBlock } from "./opportunity-seller-notes-block";

function props(overrides: Partial<Parameters<typeof OpportunitySellerNotesBlock>[0]> = {}) {
  return {
    initialNotes: "Original seller notes",
    onSave: vi.fn(),
    pending: false,
    canMutate: true,
    ...overrides,
  };
}

describe("OpportunitySellerNotesBlock", () => {
  it("seeds the textarea with initial notes", () => {
    render(<OpportunitySellerNotesBlock {...props()} />);
    expect(screen.getByRole("textbox")).toHaveValue("Original seller notes");
  });

  it("disables Save until dirty and fires onSave with trimmed notes", () => {
    const onSave = vi.fn();
    render(<OpportunitySellerNotesBlock {...props({ onSave })} />);

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Updated notes " },
    });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledWith("Updated notes");
  });

  it("fires onSave with null when cleared", () => {
    const onSave = vi.fn();
    render(<OpportunitySellerNotesBlock {...props({ onSave })} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("reset restores initial notes", () => {
    render(<OpportunitySellerNotesBlock {...props()} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("textbox")).toHaveValue("Original seller notes");
  });

  it("hides save controls when canMutate is false", () => {
    render(<OpportunitySellerNotesBlock {...props({ canMutate: false })} />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
