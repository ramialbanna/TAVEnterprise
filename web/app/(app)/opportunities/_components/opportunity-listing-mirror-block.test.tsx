import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpportunityListingMirrorBlock } from "./opportunity-listing-mirror-block";
import type { OpportunityDetail } from "@/lib/app-api/schemas";

function baseDetail(overrides: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: "opp-1",
    type: "lead",
    badges: [],
    source: "facebook",
    region: "dallas_tx",
    sourceRunId: null,
    normalizedListingId: "nl-1",
    vehicleCandidateId: null,
    leadId: "lead-1",
    title: "2020 Toyota Camry",
    year: 2020,
    make: "toyota",
    model: "camry",
    style: null,
    vin: null,
    price: 18500,
    mmrValue: 19000,
    spread: 500,
    finalScore: 80,
    grade: "good",
    status: "new",
    submittedBy: null,
    assignedTo: null,
    assignedCloserName: null,
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastEvaluatedBy: null,
    lastEvaluatedAt: null,
    firstSeenAt: "2026-07-01T00:00:00.000Z",
    lastSeenAt: "2026-07-01T00:00:00.000Z",
    receivedAt: "2026-07-01T00:00:00.000Z",
    postedAt: null,
    seenCount: 1,
    listingUrl: "https://www.facebook.com/marketplace/item/123/",
    entryMethod: "scraper",
    estimateFlags: { mileage: false, style: false, mmr: false },
    maxbuySummary: null,
    reasonCodes: [],
    valuationMissingReason: null,
    scoreComponents: null,
    candidateListingCount: null,
    mileage: 62000,
    actions: [],
    catalogMatchSuggestions: [],
    listingImages: [],
    ...overrides,
  };
}

describe("OpportunityListingMirrorBlock (item 62)", () => {
  it("renders description, seller, and gallery when present", () => {
    render(
      <OpportunityListingMirrorBlock
        opportunity={baseDetail({
          listingDescription: "One owner\nGarage kept",
          listingSellerName: "Jane Seller",
          listingCity: "Dallas",
          listingState: "TX",
          listingImages: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
        })}
      />,
    );
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText(/One owner/)).toBeInTheDocument();
    expect(screen.getByText("Jane Seller")).toBeInTheDocument();
    expect(screen.getByText("Dallas, TX")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "View listing on Facebook",
    ]);
    expect(screen.getByRole("button", { name: "No seller id" })).toBeDisabled();
  });

  it("opens the marketplace profile from Check seller on Facebook", () => {
    render(
      <OpportunityListingMirrorBlock
        opportunity={baseDetail({
          listingSellerName: "Dakota Herrel",
          listingSellerUrl: "https://www.facebook.com/marketplace/profile/100008618685090",
        })}
      />,
    );
    expect(screen.getByText("Dakota Herrel").closest("a")).toBeNull();
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAccessibleName(/View listing on Facebook/i);
    expect(links[1]).toHaveAttribute(
      "href",
      "https://www.facebook.com/marketplace/profile/100008618685090",
    );
    expect(links[1]).toHaveAccessibleName(/Check seller on Facebook/i);
  });

  it("disables seller check when the scrape has no profile id", () => {
    render(
      <OpportunityListingMirrorBlock
        opportunity={baseDetail({
          listingSellerName: "Mario G Hdz",
          listingSellerUrl: null,
        })}
      />,
    );
    expect(screen.queryByRole("link", { name: /Check seller on Facebook/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No seller id" })).toBeDisabled();
  });

  it("shows a profile button when a URL was stored without a name", () => {
    render(
      <OpportunityListingMirrorBlock
        opportunity={baseDetail({
          listingSellerName: null,
          listingSellerUrl: "https://www.facebook.com/marketplace/profile/1000526149",
        })}
      />,
    );
    expect(screen.getByRole("link", { name: /Check seller on Facebook/i })).toHaveAttribute(
      "href",
      "https://www.facebook.com/marketplace/profile/1000526149",
    );
  });

  it("serves the 1536px Facebook photo by stripping ctp from stored thumbnails", () => {
    const thumb =
      "https://scontent.xx.fbcdn.net/v/t.jpg?stp=keep_me&ctp=s261x260&oe=SIG";
    const { container } = render(
      <OpportunityListingMirrorBlock
        opportunity={baseDetail({ listingImages: [thumb] })}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://scontent.xx.fbcdn.net/v/t.jpg?stp=keep_me&oe=SIG");
    expect(img?.getAttribute("src")).not.toMatch(/ctp=/);
  });

  it("shows empty hint when no mirror content", () => {
    render(
      <OpportunityListingMirrorBlock
        opportunity={baseDetail({ listingUrl: null, listingImages: [] })}
      />,
    );
    expect(screen.getByText(/No marketplace listing text or photos yet/i)).toBeInTheDocument();
  });
});
