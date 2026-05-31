import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { EnvBadgeNew } from "./env-badge-new";

describe("EnvBadgeNew", () => {
  it("softens production badge for non-admins", () => {
    render(<EnvBadgeNew label="PRODUCTION" role="closer" />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("keeps loud production label for admins", () => {
    render(<EnvBadgeNew label="PRODUCTION" role="admin" />);
    expect(screen.getByText("PRODUCTION")).toBeInTheDocument();
  });

  it("shows staging unchanged", () => {
    render(<EnvBadgeNew label="STAGING" role="closer" />);
    expect(screen.getByText("STAGING")).toBeInTheDocument();
  });
});
