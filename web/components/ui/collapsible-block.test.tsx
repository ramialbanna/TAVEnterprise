import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CollapsibleBlock } from "./collapsible-block";

describe("CollapsibleBlock", () => {
  it("renders title and content open by default", () => {
    render(
      <CollapsibleBlock title="Vehicle">
        <p>Vehicle content</p>
      </CollapsibleBlock>,
    );
    expect(screen.getByText("Vehicle")).toBeInTheDocument();
    expect(screen.getByText("Vehicle content")).toBeInTheDocument();
  });

  it("collapses content on header click", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleBlock title="Vehicle">
        <p>Vehicle content</p>
      </CollapsibleBlock>,
    );
    expect(screen.getByText("Vehicle content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Vehicle/i }));

    expect(screen.queryByText("Vehicle content")).not.toBeInTheDocument();
  });

  it("respects defaultOpen={false}", () => {
    render(
      <CollapsibleBlock title="History" defaultOpen={false}>
        <p>History content</p>
      </CollapsibleBlock>,
    );
    expect(screen.queryByText("History content")).not.toBeInTheDocument();
  });

  it("renders description in header", () => {
    render(
      <CollapsibleBlock title="Notes" description="Add a note">
        <p>Notes content</p>
      </CollapsibleBlock>,
    );
    expect(screen.getByText("Add a note")).toBeInTheDocument();
  });

  it("calls onOpenChange when toggled", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CollapsibleBlock title="Workflow" onOpenChange={onOpenChange}>
        <p>Workflow content</p>
      </CollapsibleBlock>,
    );
    await user.click(screen.getByRole("button", { name: /Workflow/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
