import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ApiResult } from "@/lib/app-api";
import type { MmrCatalog, OpportunityDetail } from "@/lib/app-api/schemas";

import { OpportunityVehicleBlock } from "./opportunity-vehicle-block";
import { OpportunityListingBlock } from "./opportunity-listing-block";

vi.mock("@/lib/app-api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/app-api/client")>();
  return {
    ...actual,
    getMmrCatalogYears: vi.fn(),
    getMmrCatalogMakes: vi.fn(),
    getMmrCatalogModels: vi.fn(),
    getMmrCatalogStyles: vi.fn(),
    postMmrVin: vi.fn(),
  };
});

import {
  getMmrCatalogYears,
  getMmrCatalogMakes,
  getMmrCatalogModels,
  getMmrCatalogStyles,
  postMmrVin,
} from "@/lib/app-api/client";

const mockedYears = vi.mocked(getMmrCatalogYears);
const mockedMakes = vi.mocked(getMmrCatalogMakes);
const mockedModels = vi.mocked(getMmrCatalogModels);
const mockedStyles = vi.mocked(getMmrCatalogStyles);
const mockedPostMmrVin = vi.mocked(postMmrVin);

function catalogOk(items: string[]): ApiResult<MmrCatalog> {
  return {
    ok: true,
    status: 200,
    data: { items, catalogState: "connected", reason: null, cached: false },
  };
}

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
    ...overrides,
  };
}

function props(overrides: Partial<Parameters<typeof OpportunityVehicleBlock>[0]> = {}) {
  return {
    opportunity: makeDetail(),
    onSave: vi.fn(),
    pending: false,
    canMutate: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedYears.mockResolvedValue(
    catalogOk(["2024", "2023", "2022", "2021", "2020", "2019", "2018"]),
  );
  mockedMakes.mockResolvedValue(catalogOk(["Honda", "Toyota", "Kia"]));
  mockedModels.mockResolvedValue(catalogOk(["Accord", "Civic", "Sorento"]));
  mockedStyles.mockResolvedValue(catalogOk(["EX", "LX", "SX"]));
  mockedPostMmrVin.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      mmrValue: 28500,
      confidence: "high",
      method: "vin",
      year: 2021,
      make: "Kia",
      model: "Sorento",
      trim: "SX",
    },
  });
});

describe("OpportunityVehicleBlock", () => {
  it("renders text inputs for VIN/odometer and selects for catalog fields", async () => {
    render(<OpportunityVehicleBlock {...props()} />);

    expect((screen.getByLabelText("VIN") as HTMLInputElement).value).toBe(
      "1HGBH41JXMN109123",
    );
    expect((screen.getByLabelText("Odometer (mi)") as HTMLInputElement).value).toBe("32000");

    await waitFor(() => {
      expect((screen.getByLabelText("Make") as HTMLSelectElement).value).toBe("Honda");
    });
    expect(screen.getByLabelText("Year")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText("Body type")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText("Color")).toBeInstanceOf(HTMLSelectElement);
  });

  it("saves when Save is clicked", async () => {
    const onSave = vi.fn();
    render(<OpportunityVehicleBlock {...props({ onSave })} />);

    await waitFor(() => {
      expect((screen.getByLabelText("Make") as HTMLSelectElement).value).toBe("Honda");
    });

    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Red" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ color: "Red" }));
  });

  it("clears make/model/series when year changes", async () => {
    render(<OpportunityVehicleBlock {...props()} />);

    await waitFor(() => {
      expect((screen.getByLabelText("Make") as HTMLSelectElement).value).toBe("Honda");
    });

    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2020" } });

    expect((screen.getByLabelText("Make") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Series") as HTMLSelectElement).value).toBe("");
  });

  it("preserves legacy engine value not in the static list", async () => {
    render(
      <OpportunityVehicleBlock
        {...props({
          opportunity: makeDetail({ engine: "1.5L Turbo" }),
        })}
      />,
    );

    await waitFor(() => {
      expect((screen.getByLabelText("Engine") as HTMLSelectElement).value).toBe("1.5L Turbo");
    });
    expect(screen.getByRole("option", { name: "1.5L Turbo" })).toBeInTheDocument();
  });

  it("does not save until Save is clicked", async () => {
    const onSave = vi.fn();
    render(<OpportunityVehicleBlock {...props({ onSave })} />);

    await waitFor(() => {
      expect((screen.getByLabelText("Make") as HTMLSelectElement).value).toBe("Honda");
    });

    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Red" } });
    fireEvent.blur(screen.getByLabelText("Color"), {
      relatedTarget: screen.getByLabelText("VIN"),
    });

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("renders Additional Information with location and source", () => {
    render(
      <OpportunityVehicleBlock
        {...props({
          opportunity: makeDetail({
            region: "dallas_tx",
            source: "facebook",
            contactAddress: null,
          }),
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "Additional Information" })).toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toHaveTextContent("Dallas");
    expect(screen.getByLabelText("Source")).toHaveTextContent("Facebook");
  });

  it("prefers contact address for location when available", () => {
    render(
      <OpportunityVehicleBlock
        {...props({
          opportunity: makeDetail({
            region: "dallas_tx",
            contactAddress: "123 Main St",
            contactPostalCode: "75201",
          }),
        })}
      />,
    );

    expect(screen.getByLabelText("Location")).toHaveTextContent("123 Main St, 75201");
  });

  it("decodes VIN on save and patches catalog Y/M/M/S", async () => {
    const onSave = vi.fn();
    render(
      <OpportunityVehicleBlock
        {...props({
          onSave,
          opportunity: makeDetail({
            vin: null,
            year: 2021,
            make: null,
            model: null,
            style: null,
          }),
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("VIN"), {
      target: { value: "7MUCAAAG7NV022177" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        vin: "7MUCAAAG7NV022177",
        make: "Kia",
        model: "Sorento",
        style: "SX",
      }),
    );
    expect(mockedPostMmrVin).toHaveBeenCalledWith({
      vin: "7MUCAAAG7NV022177",
      mileage: 32000,
    });
    expect(screen.getByText(/filled from VIN/i)).toBeInTheDocument();
  });

  it("keeps VIN and existing YMM when decode fails", async () => {
    mockedPostMmrVin.mockResolvedValue({
      ok: false,
      kind: "unavailable",
      error: "no_mmr_value",
      status: 200,
      message: "No MMR value available for this VIN.",
    });
    const onSave = vi.fn();
    render(
      <OpportunityVehicleBlock
        {...props({
          onSave,
          opportunity: makeDetail({
            vin: null,
            year: 2021,
            make: "Honda",
            model: "Accord",
            style: "EX",
          }),
        })}
      />,
    );

    await waitFor(() => {
      expect((screen.getByLabelText("Make") as HTMLSelectElement).value).toBe("Honda");
    });

    fireEvent.change(screen.getByLabelText("VIN"), {
      target: { value: "7MUCAAAG7NV022177" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ vin: "7MUCAAAG7NV022177" }),
    );
    expect(screen.getByText(/No MMR value available/i)).toBeInTheDocument();
    expect((screen.getByLabelText("Make") as HTMLSelectElement).value).toBe("Honda");
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("Accord");
  });
});

describe("OpportunityListingBlock", () => {
  it("renders provenance fields with manual-submit parity", () => {
    render(<OpportunityListingBlock opportunity={makeDetail()} />);

    expect(screen.getByText("Listing URL")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("facebook")).toBeInTheDocument();
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByText("Dallas")).toBeInTheDocument();
    expect(screen.getByText("Asking price")).toBeInTheDocument();
    expect(screen.getByText("$12,000")).toBeInTheDocument();
    expect(screen.getByText("Submitted by")).toBeInTheDocument();
    expect(screen.getByText("Jane Buyer")).toBeInTheDocument();
    expect(screen.getByText("Entry method")).toBeInTheDocument();
    expect(screen.getByText("Manual submit")).toBeInTheDocument();
    expect(screen.getByText("Assigned closer")).toBeInTheDocument();
    expect(screen.getByText("Closer One")).toBeInTheDocument();
    expect(screen.getByText("Seen count")).toBeInTheDocument();
  });

  it("renders em-dash when listing URL is missing", () => {
    render(<OpportunityListingBlock opportunity={makeDetail({ listingUrl: null })} />);
    const urlRow = screen.getByText("Listing URL").closest("dl");
    expect(urlRow).toBeInTheDocument();
  });

  it("shows scraper entry method label", () => {
    render(
      <OpportunityListingBlock
        opportunity={makeDetail({ entryMethod: "scraper" })}
      />,
    );
    expect(screen.getByText("Scraper")).toBeInTheDocument();
  });
});
