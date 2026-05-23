import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { ApiResult } from "@/lib/app-api";
import type { AppUserSummary, ManualSubmissionResult } from "@/lib/app-api/schemas";

import { ManualSubmitDialog } from "./manual-submit-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return {
    ...actual,
    listAppUsers: vi.fn(),
    submitManualOpportunity: vi.fn(),
  };
});

import { listAppUsers, submitManualOpportunity } from "@/lib/app-api/client";

const mockedUsers = vi.mocked(listAppUsers);
const mockedSubmit = vi.mocked(submitManualOpportunity);

function TestWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUsers.mockResolvedValue({
    ok: true,
    status: 200,
    data: [
      {
        id: "user-closer",
        email: "closer@texasautovalue.com",
        displayName: "Closer Two",
        role: "closer",
      },
    ],
  } satisfies ApiResult<AppUserSummary[]>);
});

describe("ManualSubmitDialog", () => {
  it("opens the form and submits a listing URL", async () => {
    mockedSubmit.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        submissionId: "submission-1",
        normalizedListingId: "listing-1",
        isDuplicateUrl: false,
        warnings: [],
        opportunity: null,
      },
    } satisfies ApiResult<ManualSubmissionResult>);

    const user = userEvent.setup();
    render(<ManualSubmitDialog />, { wrapper: TestWrapper });

    await user.click(screen.getByRole("button", { name: /submit listing/i }));

    expect(await screen.findByLabelText(/listing url/i)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/listing url/i),
      "https://www.facebook.com/marketplace/item/123",
    );
    await user.click(screen.getByRole("button", { name: /^submit listing$/i }));

    await waitFor(() => {
      expect(mockedSubmit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          listingUrl: "https://www.facebook.com/marketplace/item/123",
          region: "dallas_tx",
        }),
      );
    });
  });
});
