import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { OpportunityDetail } from "@/lib/app-api/schemas";

import { OpportunityDetailClientNew } from "./opportunity-detail-client-new";

const refresh = vi.fn();
const patchOpportunity = vi.fn();
const getAppMe = vi.fn();
const evaluateOpportunity = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/app-api/client", () => ({
  getAppMe: (...args: unknown[]) => getAppMe(...args),
  patchOpportunity: (...args: unknown[]) => patchOpportunity(...args),
  evaluateOpportunity: (...args: unknown[]) => evaluateOpportunity(...args),
  listAppUsers: vi.fn(async () => ({ ok: true, data: [] })),
  claimOpportunity: vi.fn(),
  assignOpportunity: vi.fn(),
  updateOpportunityStatus: vi.fn(),
  // VIN decode on Save (#48) — must resolve or the vehicle block never PATCHes.
  postMmrVin: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: {
      mmrValue: 15000,
      confidence: "high",
      method: "vin",
      year: 2019,
      make: "Honda",
      model: "Accord",
      trim: "EX",
    },
  })),
  getMmrCatalogYears: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: { items: ["2019", "2020"], catalogState: "connected", reason: null, cached: false },
  })),
  getMmrCatalogMakes: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: { items: ["Honda"], catalogState: "connected", reason: null, cached: false },
  })),
  getMmrCatalogModels: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: { items: ["Accord"], catalogState: "connected", reason: null, cached: false },
  })),
  getMmrCatalogStyles: vi.fn(async () => ({
    ok: true,
    status: 200,
    data: { items: ["EX"], catalogState: "connected", reason: null, cached: false },
  })),
}));

vi.mock("./opportunity-valuation-block", () => ({
  OpportunityValuationBlock: () => <div data-testid="valuation-block" />,
}));

// #49 test only needs VIN PATCH round-trip; stub decode so Save never waits on Cox.
vi.mock("./decode-vin-to-vehicle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./decode-vin-to-vehicle")>();
  return {
    ...actual,
    decodeVinToVehicleSelection: vi.fn(async () => ({
      ok: false as const,
      error: "decode stubbed in detail-client test",
    })),
  };
});

vi.mock("./use-vehicle-catalog", () => ({
  useVehicleCatalogOptions: () => ({
    years: ["2019", "2020"],
    makes: ["Honda"],
    models: ["Accord"],
    styles: ["EX"],
    catalogState: "connected" as const,
    reason: null,
    loading: null,
  }),
  partitionYears: (years: string[]) => ({ recent: years, older: [] as string[] }),
  matchCatalogOption: (options: string[], rawValue: string | undefined) => {
    if (!rawValue?.trim()) return null;
    const needle = rawValue.trim().toLowerCase();
    return options.find((o) => o.toLowerCase() === needle) ?? null;
  },
  applyVehicleCascadeChange: (
    prev: { year: string; make: string; model: string; style: string },
    next: { year: string; make: string; model: string; style: string },
  ) => {
    if (next.year !== prev.year) return { ...next, make: "", model: "", style: "" };
    if (next.make !== prev.make) return { ...next, model: "", style: "" };
    if (next.model !== prev.model) return { ...next, style: "" };
    return next;
  },
}));

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
    vin: null,
    price: 12000,
    mmrValue: 15000,
    spread: 3000,
    finalScore: 82,
    grade: "excellent",
    status: "new",
    submittedBy: "Jane Buyer",
    assignedTo: "user-1",
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
    ...overrides,
  };
}

function renderDetail(detail: OpportunityDetail) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OpportunityDetailClientNew initial={detail} />
    </QueryClientProvider>,
  );
}

describe("OpportunityDetailClientNew — VIN save (#49)", () => {
  beforeEach(() => {
    refresh.mockReset();
    patchOpportunity.mockReset();
    getAppMe.mockReset();
    evaluateOpportunity.mockReset();

    getAppMe.mockResolvedValue({
      ok: true,
      data: {
        id: "user-1",
        email: "closer@texasautovalue.com",
        displayName: "Closer One",
        role: "closer",
        active: true,
      },
    });
    evaluateOpportunity.mockResolvedValue({
      ok: true,
      data: makeDetail({ vin: null }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps VIN visible after save using PATCH response (not stale initial)", async () => {
    const user = userEvent.setup();
    const savedVin = "1HGBH41JXMN109123";
    patchOpportunity.mockResolvedValue({
      ok: true,
      data: makeDetail({ vin: savedVin }),
    });

    renderDetail(makeDetail({ vin: null }));

    const vinInput = await screen.findByLabelText("VIN");
    await waitFor(() => expect(vinInput).not.toBeDisabled());
    expect(vinInput).toHaveValue("");

    await user.click(vinInput);
    await user.paste(savedVin);
    expect(vinInput).toHaveValue(savedVin);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchOpportunity).toHaveBeenCalled());
    expect(patchOpportunity).toHaveBeenCalledWith(
      "listing-1",
      expect.objectContaining({ vin: savedVin }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("VIN")).toHaveValue(savedVin);
    });
  });
});
