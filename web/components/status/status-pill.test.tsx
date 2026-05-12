import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StatusPill } from "./status-pill";
import type { OperationalStatus } from "./health-dot";

const STATUSES: OperationalStatus[] = ["healthy", "review", "error", "neutral"];

describe("StatusPill", () => {
  it("applies the healthy token classes", () => {
    render(<StatusPill status="healthy">Healthy</StatusPill>);
    const className = screen.getByText("Healthy").className;
    expect(className).toContain("bg-status-healthy-bg");
    expect(className).toContain("text-status-healthy");
  });

  it("applies the error token classes", () => {
    render(<StatusPill status="error">Down</StatusPill>);
    const className = screen.getByText("Down").className;
    expect(className).toContain("bg-status-error-bg");
    expect(className).toContain("text-status-error");
  });

  it("maps every operational status to its semantic variant", () => {
    for (const status of STATUSES) {
      const { unmount } = render(<StatusPill status={status}>{status}</StatusPill>);
      expect(screen.getByText(status).className).toContain(`text-status-${status}`);
      unmount();
    }
  });
});
