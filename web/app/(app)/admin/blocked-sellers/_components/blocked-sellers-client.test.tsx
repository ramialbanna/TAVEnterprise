import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { BlockedSellerReview } from "@/lib/app-api/schemas";

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return { ...actual, listBlockedSellers: vi.fn(), unblockBlockedSeller: vi.fn() };
});

import { listBlockedSellers } from "@/lib/app-api/client";

import { BlockedSellersClient } from "./blocked-sellers-client";

const mockedList = vi.mocked(listBlockedSellers);

function review(partial: Partial<BlockedSellerReview>): BlockedSellerReview {
  return {
    id: partial.id ?? "bs-1",
    relatedIds: [],
    sellerName: partial.sellerName ?? "randy white",
    sellerUrl: partial.sellerUrl ?? "https://facebook.com/marketplace/profile/1",
    reason: "dealer",
    origin: partial.origin ?? "auto",
    listingCount: partial.listingCount ?? 1,
    createdAt: partial.createdAt ?? "2026-09-06T12:00:00Z",
    listings: partial.listings ?? [
      {
        id: "nl-1",
        title: "2018 Honda Civic",
        listingUrl: "https://facebook.com/marketplace/item/1",
        price: 9000,
        year: 2018,
        make: "Honda",
        model: "Civic",
        firstSeenAt: "2026-09-01T12:00:00Z",
        opportunityHref: null,
      },
    ],
  };
}

function renderClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<BlockedSellersClient />, { wrapper: Wrapper });
}

beforeEach(() => {
  mockedList.mockResolvedValue({
    ok: true,
    status: 200,
    data: [
      review({
        id: "auto-one",
        sellerName: "randy white",
        origin: "auto",
        listingCount: 1,
        createdAt: "2026-09-06T12:00:00Z",
      }),
      review({
        id: "buyer-lot",
        sellerName: "imd motors dallas",
        sellerUrl: "https://facebook.com/marketplace/profile/2",
        origin: "buyer",
        listingCount: 4,
        createdAt: "2026-09-01T12:00:00Z",
        listings: [
          {
            id: "nl-lot",
            title: "2020 Ford F-150",
            listingUrl: null,
            price: 18000,
            year: 2020,
            make: "Ford",
            model: "F-150",
            firstSeenAt: "2026-09-01T12:00:00Z",
            opportunityHref: null,
          },
        ],
      }),
    ],
  });
});

describe("BlockedSellersClient", () => {
  it("sorts newest first and filters by origin", async () => {
    const user = userEvent.setup();
    renderClient();

    await waitFor(() => {
      expect(screen.getByText("Randy White")).toBeInTheDocument();
    });
    expect(screen.getByText("Imd Motors Dallas")).toBeInTheDocument();
    expect(screen.getByText("2 sellers")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Origin"), "buyer");
    expect(screen.queryByText("Randy White")).not.toBeInTheDocument();
    expect(screen.getByText("Imd Motors Dallas")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 sellers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("searches listing titles and sorts by name", async () => {
    const user = userEvent.setup();
    renderClient();

    await waitFor(() => {
      expect(screen.getByText("Randy White")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Search blocked sellers"), "civic");
    expect(screen.getByText("Randy White")).toBeInTheDocument();
    expect(screen.queryByText("Imd Motors Dallas")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search blocked sellers"));
    await user.selectOptions(screen.getByLabelText("Sort"), "sellerName:asc");

    const names = screen.getAllByRole("row").slice(1).map((row) => row.textContent ?? "");
    expect(names[0]).toMatch(/Imd Motors Dallas/);
    expect(names[1]).toMatch(/Randy White/);
  });
});
