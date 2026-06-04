import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MaxbuyPassDialog } from "./maxbuy-pass-dialog";

describe("MaxbuyPassDialog", () => {
  it("submits structured pass reason", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <MaxbuyPassDialog
        open
        onOpenChange={() => {}}
        initialReason="passed_despite_buy"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: /log pass/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ pass_reason: "passed_despite_buy" }),
    );
  });
});
