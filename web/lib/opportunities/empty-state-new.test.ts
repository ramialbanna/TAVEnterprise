import { describe, expect, it } from "vitest";

import { emptyStateForView, QUEUE_EMPTY_STATE_NEW } from "./empty-state-new";

describe("empty-state-new", () => {
  it("provides submit CTA on All tab", () => {
    const all = emptyStateForView("all");
    expect(all.action?.href).toBe("/opportunities/submit");
    expect(all.exampleUrl).toBeTruthy();
  });

  it("covers every queue view", () => {
    for (const view of Object.keys(QUEUE_EMPTY_STATE_NEW)) {
      expect(emptyStateForView(view as keyof typeof QUEUE_EMPTY_STATE_NEW).title).toBeTruthy();
    }
  });
});
