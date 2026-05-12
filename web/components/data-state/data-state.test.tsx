import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { codeMessage, type ErrorKind } from "@/lib/app-api";
import {
  EmptyState,
  ErrorState,
  errorStateTitle,
  LoadingState,
  PendingBackendState,
  SessionExpiredState,
  UnavailableState,
  type ApiErrorResult,
} from "./index";

function apiError(over: Partial<ApiErrorResult> = {}): ApiErrorResult {
  return {
    ok: false,
    kind: "unavailable",
    error: "db_error",
    status: 503,
    message: "The database is temporarily unavailable — try again.",
    ...over,
  };
}

describe("LoadingState", () => {
  it("renders a skeleton (animate-pulse) region", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("block variant renders a single skeleton box", () => {
    const { container } = render(<LoadingState variant="block" />);
    expect(container.querySelectorAll(".animate-pulse").length).toBe(1);
  });

  it("cards variant renders one skeleton card per count", () => {
    const { container } = render(<LoadingState variant="cards" count={3} />);
    // each CardSkeleton has multiple Skeletons; assert at least `count` cards rendered
    expect(container.querySelectorAll("[aria-hidden] .animate-pulse").length).toBeGreaterThanOrEqual(3);
  });
});

describe("EmptyState", () => {
  it("renders title, hint and action", () => {
    render(
      <EmptyState
        title="No sales yet"
        hint="Try a different filter."
        action={<button type="button">Reset</button>}
      />,
    );
    expect(screen.getByText("No sales yet")).toBeInTheDocument();
    expect(screen.getByText("Try a different filter.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});

describe("UnavailableState", () => {
  it("renders codeMessage for a known missingReason and no fabricated number", () => {
    const { container } = render(<UnavailableState code="db_error" />);
    expect(screen.getByText(codeMessage("db_error"))).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/[0-9]/);
  });

  it("falls back to the generic copy for an unknown code", () => {
    render(<UnavailableState code="totally_unknown_code" />);
    expect(screen.getByText("Not available.")).toBeInTheDocument();
  });

  it("inline size renders just the title text", () => {
    render(<UnavailableState code="db_error" size="inline" title="—" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("PendingBackendState", () => {
  it("renders the pending label and no fabricated value", () => {
    const { container } = render(<PendingBackendState label="Sell-through rate" />);
    expect(screen.getByText("Pending backend")).toBeInTheDocument();
    expect(screen.getByText(/Sell-through rate/)).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/[0-9]/);
  });
});

describe("errorStateTitle", () => {
  it("maps every kind to a non-empty headline", () => {
    const kinds: ErrorKind[] = ["unauthorized", "unavailable", "invalid", "server", "proxy", "unknown"];
    for (const k of kinds) expect(errorStateTitle(k).length).toBeGreaterThan(0);
    expect(errorStateTitle("unauthorized")).toMatch(/session/i);
  });
});

describe("ErrorState", () => {
  it("renders the kind headline + message and a working Retry for a retryable error", () => {
    const onRetry = vi.fn();
    render(<ErrorState error={apiError()} onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Temporarily unavailable")).toBeInTheDocument();
    expect(screen.getByText("The database is temporarily unavailable — try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not render Retry for a non-retryable error even with onRetry", () => {
    render(
      <ErrorState
        error={apiError({ kind: "invalid", error: "invalid_body", status: 400, message: "rejected" })}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("does not render Retry when onRetry is omitted", () => {
    render(<ErrorState error={apiError()} />);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("shows a sign-in link for an expired session", () => {
    render(
      <ErrorState
        error={apiError({ kind: "unauthorized", error: "unauthorized", status: 401, message: "expired" })}
      />,
    );
    const link = screen.getByRole("link", { name: /sign in again/i });
    expect(link).toHaveAttribute("href", "/signin");
  });
});

describe("SessionExpiredState", () => {
  it("renders a sign-in link to /signin", () => {
    render(<SessionExpiredState />);
    expect(screen.getByRole("link", { name: /sign in again/i })).toHaveAttribute("href", "/signin");
  });
});
