import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { OpportunityDetail } from "@/lib/app-api/schemas";

import { OpportunityTitleInformationBlock } from "./opportunity-title-information-block";

function makeDetail(overrides: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: "listing-1",
    type: "lead",
    badges: ["First seen"],
    source: "facebook",
    region: "dallas_tx",
    sourceRunId: null,
    normalizedListingId: "listing-1",
    vehicleCandidateId: null,
    leadId: "lead-1",
    title: "2019 Honda Accord",
    year: 2019,
    make: "Honda",
    model: "Accord",
    style: "EX",
    vin: "1HGBH41JXMN109123",
    price: 12000,
    mmrValue: 15000,
    spread: 3000,
    finalScore: 82,
    grade: "excellent",
    status: "new",
    submittedBy: "Jane Buyer",
    assignedTo: null,
    assignedCloserName: "Closer One",
    claimedBy: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastEvaluatedBy: null,
    lastEvaluatedAt: null,
    firstSeenAt: "2026-06-01T10:00:00.000Z",
    lastSeenAt: "2026-06-02T10:00:00.000Z",
    seenCount: 3,
    listingUrl: "https://example.com/listing",
    entryMethod: "manual",
    estimateFlags: { mmr: false, mileage: false, style: false },
    reasonCodes: [],
    valuationMissingReason: null,
    scoreComponents: null,
    candidateListingCount: null,
    mileage: 32000,
    actions: [],
    bodyType: null,
    engine: null,
    transmission: null,
    color: null,
    contactFirstName: null,
    contactLastName: null,
    contactHomePhone: null,
    contactEmail: null,
    contactAddress: null,
    contactPostalCode: null,
    salesperson: null,
    appraiser: null,
    titleOwner: null,
    titleStateRegion: null,
    lienHolder: null,
    lienAccountNumber: null,
    lienPayoff: null,
    tagOrPlate: null,
    tagStateRegion: null,
    tagExpiration: null,
    certified: false,
    extendedWarranty: false,
    catalogMatchSuggestions: [],
    ...overrides,
  };
}

describe("OpportunityTitleInformationBlock", () => {
  it("renders state dropdowns with all US states", () => {
    render(
      <OpportunityTitleInformationBlock
        opportunity={makeDetail()}
        onSave={vi.fn()}
        pending={false}
        canMutate
      />,
    );

    const titleState = screen.getByLabelText("State/Region");
    const tagState = screen.getByLabelText("Tag State/Region");
    expect(titleState.tagName).toBe("SELECT");
    expect(tagState.tagName).toBe("SELECT");
    expect(screen.getAllByRole("option", { name: "Texas" })).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: "Select state" })).toHaveLength(2);
  });

  it("pre-selects saved state codes and normalizes full names", () => {
    render(
      <OpportunityTitleInformationBlock
        opportunity={makeDetail({ titleStateRegion: "Texas", tagStateRegion: "ca" })}
        onSave={vi.fn()}
        pending={false}
        canMutate
      />,
    );

    expect(screen.getByLabelText("State/Region")).toHaveValue("TX");
    expect(screen.getByLabelText("Tag State/Region")).toHaveValue("CA");
  });

  it("shows legacy free-text values until re-selected", () => {
    render(
      <OpportunityTitleInformationBlock
        opportunity={makeDetail({ titleStateRegion: "Dallas County" })}
        onSave={vi.fn()}
        pending={false}
        canMutate
      />,
    );

    expect(screen.getByLabelText("State/Region")).toHaveValue("Dallas County");
    expect(
      screen.getByRole("option", { name: "Dallas County (update selection)" }),
    ).toBeInTheDocument();
  });

  it("PATCHes selected state codes on blur save", async () => {
    const onSave = vi.fn();
    render(
      <OpportunityTitleInformationBlock
        opportunity={makeDetail()}
        onSave={onSave}
        pending={false}
        canMutate
      />,
    );

    fireEvent.change(screen.getByLabelText("State/Region"), { target: { value: "TX" } });
    fireEvent.change(screen.getByLabelText("Tag State/Region"), { target: { value: "OK" } });

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    fireEvent.blur(screen.getByLabelText("Tag State/Region"), { relatedTarget: outside });

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        titleStateRegion: "TX",
        tagStateRegion: "OK",
      }),
    );
    outside.remove();
  });

  it("keeps Owner and Lien Payoff editable regardless of checkbox state", () => {
    render(
      <OpportunityTitleInformationBlock
        opportunity={makeDetail()}
        onSave={vi.fn()}
        pending={false}
        canMutate
      />,
    );

    expect(screen.getByLabelText("Owner")).not.toBeDisabled();
    expect(screen.getByLabelText("Lien Payoff")).not.toBeDisabled();
  });

  it("does not clear linked fields when checkboxes are unchecked", () => {
    render(
      <OpportunityTitleInformationBlock
        opportunity={makeDetail({
          certified: true,
          titleOwner: "Jane Doe",
          extendedWarranty: true,
          lienPayoff: 1200,
        })}
        onSave={vi.fn()}
        pending={false}
        canMutate
      />,
    );

    fireEvent.click(screen.getByLabelText("Certified"));
    fireEvent.click(screen.getByLabelText("Extended Warranty"));

    expect(screen.getByLabelText("Owner")).toHaveValue("Jane Doe");
    expect(screen.getByLabelText("Lien Payoff")).toHaveValue("1200");
  });

  it("PATCHes checkbox and field values independently on blur save", async () => {
    const onSave = vi.fn();
    render(
      <OpportunityTitleInformationBlock
        opportunity={makeDetail()}
        onSave={onSave}
        pending={false}
        canMutate
      />,
    );

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByLabelText("Lien Payoff"), { target: { value: "1500" } });
    fireEvent.click(screen.getByLabelText("Certified"));
    fireEvent.click(screen.getByLabelText("Extended Warranty"));

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    fireEvent.blur(screen.getByLabelText("Lien Payoff"), { relatedTarget: outside });

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        certified: true,
        titleOwner: "Jane Doe",
        extendedWarranty: true,
        lienPayoff: 1500,
      }),
    );
    outside.remove();
  });
});
