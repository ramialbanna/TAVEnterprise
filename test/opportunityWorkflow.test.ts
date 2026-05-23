import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assignOpportunity,
  claimOpportunity,
  isActiveClaim,
  OpportunityWorkflowError,
  recordOpportunityEvaluation,
} from "../src/persistence/opportunityWorkflow";
import { getOpportunityDetail } from "../src/persistence/opportunities";
import { getActiveUserById } from "../src/persistence/users";

vi.mock("../src/persistence/opportunities", () => ({
  getOpportunityDetail: vi.fn(),
}));

vi.mock("../src/persistence/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/persistence/users")>();
  return {
    ...actual,
    getActiveUserById: vi.fn(),
  };
});

const admin = {
  id: "admin-1",
  email: "admin@texasautovalue.com",
  displayName: "Admin One",
  role: "admin" as const,
  isActive: true,
  createdAt: "2026-05-22T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
};

const closer = {
  id: "closer-1",
  email: "closer@texasautovalue.com",
  displayName: "Closer One",
  role: "closer" as const,
  isActive: true,
  createdAt: "2026-05-22T00:00:00.000Z",
  updatedAt: "2026-05-22T00:00:00.000Z",
};

const viewer = {
  ...closer,
  id: "viewer-1",
  role: "viewer" as const,
  displayName: "Viewer One",
};

const baseOpportunity = {
  id: "listing-1",
  type: "near_miss" as const,
  badges: [],
  source: "facebook",
  region: "dallas_tx",
  sourceRunId: null,
  normalizedListingId: "listing-1",
  vehicleCandidateId: null,
  leadId: null,
  title: "2020 Toyota Camry",
  year: 2020,
  make: "toyota",
  model: "camry",
  style: null,
  vin: null,
  price: 15000,
  mmrValue: 17000,
  spread: 2000,
  finalScore: null,
  grade: null,
  status: "new",
  submittedBy: null,
  assignedTo: null,
  assignedCloserName: null,
  claimedBy: null,
  claimedAt: null,
  claimExpiresAt: null,
  lastEvaluatedBy: null,
  lastEvaluatedAt: null,
  firstSeenAt: "2026-05-22T00:00:00.000Z",
  lastSeenAt: "2026-05-22T00:00:00.000Z",
  seenCount: 1,
  listingUrl: "https://facebook.com/marketplace/item/1",
  estimateFlags: { mileage: false, style: false, mmr: false },
  reasonCodes: [],
  valuationMissingReason: null,
  scoreComponents: null,
  candidateListingCount: null,
  mileage: 50000,
};

type WorkflowState = Record<string, unknown> | null;

function makeWorkflowDb(initial: WorkflowState = null) {
  let workflow = initial ? { ...initial } : null;
  const actions: Array<Record<string, unknown>> = [];

  return {
    actions,
    from(table: string) {
      if (table === "normalized_listings") {
        return {
          select(_cols?: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  maybeSingle: async () => ({ data: { id: "listing-1" }, error: null }),
                };
              },
            };
          },
        };
      }

      if (table === "leads") {
        return {
          select(_cols?: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  maybeSingle: async () => ({ data: null, error: null }),
                };
              },
            };
          },
          update(_patch: unknown) {
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      if (table === "opportunity_workflow") {
        return {
          select(_cols?: string) {
            return {
              eq(_col: string, val: string) {
                return {
                  maybeSingle: async () => ({
                    data: workflow && workflow.normalized_listing_id === val ? workflow : null,
                    error: null,
                  }),
                  single: async () => ({
                    data: workflow,
                    error: null,
                  }),
                };
              },
              in(_col: string, vals: string[]) {
                return Promise.resolve({
                  data: workflow && vals.includes(workflow.normalized_listing_id as string) ? [workflow] : [],
                  error: null,
                });
              },
            };
          },
          insert(row: Record<string, unknown>) {
            workflow = { ...row };
            return {
              select(_cols?: string) {
                return {
                  single: async () => ({ data: workflow, error: null }),
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            workflow = { ...(workflow ?? {}), ...patch };
            return {
              eq(_col: string, _val: string) {
                return {
                  select(_cols?: string) {
                    return {
                      single: async () => ({ data: workflow, error: null }),
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "opportunity_actions") {
        return {
          insert(row: Record<string, unknown>) {
            actions.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "users") {
        return {
          select(_cols?: string) {
            return {
              in(_col: string, ids: string[]) {
                return Promise.resolve({
                  data: ids.map((id) => ({
                    id,
                    display_name: id === "closer-1" ? "Closer One" : "Admin One",
                  })),
                  error: null,
                });
              },
            };
          },
        };
      }

      throw new Error(`unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOpportunityDetail).mockResolvedValue(baseOpportunity);
});

describe("isActiveClaim", () => {
  it("returns true before claim expiry", () => {
    expect(
      isActiveClaim({
        claimedByUserId: "closer-1",
        claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  it("returns false after claim expiry", () => {
    expect(
      isActiveClaim({
        claimedByUserId: "closer-1",
        claimExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(false);
  });
});

describe("assignOpportunity", () => {
  it("rejects non-admin users", async () => {
    await expect(
      assignOpportunity(makeWorkflowDb() as never, "listing-1", closer, "closer-1"),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("assigns an active closer and writes audit", async () => {
    vi.mocked(getActiveUserById).mockResolvedValue({
      id: "closer-1",
      email: "closer@texasautovalue.com",
      displayName: "Closer One",
      role: "closer",
    });

    const db = makeWorkflowDb();
    const result = await assignOpportunity(db as never, "listing-1", admin, "closer-1");

    expect(result.id).toBe("listing-1");
    expect(db.actions.some((a) => a.action === "assigned")).toBe(true);
  });
});

describe("claimOpportunity", () => {
  it("rejects viewers", async () => {
    await expect(claimOpportunity(makeWorkflowDb() as never, "listing-1", viewer)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("claims an unassigned opportunity", async () => {
    const db = makeWorkflowDb();
    const result = await claimOpportunity(db as never, "listing-1", closer);

    expect(result.id).toBe("listing-1");
    expect(db.actions.some((a) => a.action === "claimed")).toBe(true);
  });

  it("rejects when another user has an active claim", async () => {
    const db = makeWorkflowDb({
      normalized_listing_id: "listing-1",
      status: "claimed",
      assigned_to_user_id: "other-1",
      assigned_at: "2026-05-22T00:00:00.000Z",
      assigned_by_user_id: "other-1",
      claimed_by_user_id: "other-1",
      claimed_at: "2026-05-22T00:00:00.000Z",
      claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
      last_evaluated_by_user_id: null,
      last_evaluated_at: null,
    });

    await expect(claimOpportunity(db as never, "listing-1", closer)).rejects.toBeInstanceOf(
      OpportunityWorkflowError,
    );
  });
});

describe("recordOpportunityEvaluation", () => {
  it("records an evaluated action", async () => {
    const db = makeWorkflowDb();
    await recordOpportunityEvaluation(db as never, "listing-1", closer);
    expect(db.actions.some((a) => a.action === "evaluated")).toBe(true);
  });
});
