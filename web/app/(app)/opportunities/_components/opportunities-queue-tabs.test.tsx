import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OpportunitiesQueueTabs } from "./opportunities-queue-tabs";

describe("OpportunitiesQueueTabs", () => {
  it("renders queue tabs and reports view changes", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();

    render(
      <OpportunitiesQueueTabs
        view="needs_action"
        counts={{ needs_action: 3, mine: 1 }}
        onViewChange={onViewChange}
      />,
    );

    expect(screen.getByRole("tab", { name: /Needs action/i })).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Worth a look/i }));
    expect(onViewChange).toHaveBeenCalledWith("worth_a_look");
  });

  it("prefetches on hover and shows a spinner on the active tab while loading", async () => {
    const user = userEvent.setup();
    const onPrefetchView = vi.fn();

    render(
      <OpportunitiesQueueTabs
        view="needs_action"
        counts={{ needs_action: 3 }}
        loading
        onViewChange={vi.fn()}
        onPrefetchView={onPrefetchView}
      />,
    );

    await user.hover(screen.getByRole("tab", { name: /Mine/i }));
    expect(onPrefetchView).toHaveBeenCalledWith("mine");
    expect(screen.getByRole("tab", { name: /Needs action/i }).querySelector("svg")).toBeTruthy();
  });
});
