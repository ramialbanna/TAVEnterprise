import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assignOpportunity,
  claimOpportunity,
  dismissOpportunity,
  isActiveClaim,
  normalizeMutatableWorkflowStatus,
  OpportunityWorkflowError,
  recordOpportunityEvaluation,
  updateOpportunityStatus,
  addOpportunityNote,
  listOpportunityActions,
  writeOpportunityAction,
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
  receivedAt: "2026-05-22T00:00:00.000Z",
  postedAt: null,
  seenCount: 1,
  listingUrl: "https://facebook.com/marketplace/item/1",
  entryMethod: null,
  estimateFlags: { mileage: false, style: false, mmr: false },
  maxbuySummary: null,
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
  reasonCodes: [],
  valuationMissingReason: null,
  scoreComponents: null,
  candidateListingCount: null,
  mileage: 50000,
  actions: [],
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
          select(_cols?: string) {
            return {
              eq(_col: string, _val: string) {
                return {
                  order(_col: string, _opts?: { ascending?: boolean }) {
                    return Promise.resolve({
                      data: actions.map((row, index) => ({
                        id: `action-${index}`,
                        normalized_listing_id: row.normalized_listing_id,
                        actor_user_id: row.actor_user_id,
                        action: row.action,
                        notes: row.notes ?? null,
                        metadata: row.metadata ?? {},
                        created_at: "2026-05-23T00:00:00.000Z",
                      })),
                      error: null,
                    });
                  },
                };
              },
            };
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

describe("normalizeMutatableWorkflowStatus", () => {
  it("accepts bought as an alias for purchased", () => {
    expect(normalizeMutatableWorkflowStatus("bought")).toBe("purchased");
  });

  it("rejects unknown statuses", () => {
    expect(normalizeMutatableWorkflowStatus("claimed")).toBeNull();
  });
});

describe("updateOpportunityStatus", () => {
  it("rejects viewers", async () => {
    await expect(
      updateOpportunityStatus(makeWorkflowDb() as never, "listing-1", viewer, "reviewed"),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("updates status for the active claim owner and writes audit", async () => {
    const db = makeWorkflowDb({
      normalized_listing_id: "listing-1",
      status: "claimed",
      assigned_to_user_id: "closer-1",
      assigned_at: "2026-05-22T00:00:00.000Z",
      assigned_by_user_id: "closer-1",
      claimed_by_user_id: "closer-1",
      claimed_at: "2026-05-22T00:00:00.000Z",
      claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
      last_evaluated_by_user_id: null,
      last_evaluated_at: null,
    });

    vi.mocked(getOpportunityDetail).mockResolvedValue({
      ...baseOpportunity,
      status: "reviewed",
    });

    const result = await updateOpportunityStatus(db as never, "listing-1", closer, "reviewed");

    expect(result.status).toBe("reviewed");
    expect(db.actions.some((a) => a.action === "status_changed")).toBe(true);
  });

  it("rejects non-admin updates from closed opportunities", async () => {
    const db = makeWorkflowDb({
      normalized_listing_id: "listing-1",
      status: "passed",
      assigned_to_user_id: "closer-1",
      assigned_at: "2026-05-22T00:00:00.000Z",
      assigned_by_user_id: "closer-1",
      claimed_by_user_id: "closer-1",
      claimed_at: "2026-05-22T00:00:00.000Z",
      claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
      last_evaluated_by_user_id: null,
      last_evaluated_at: null,
    });

    await expect(
      updateOpportunityStatus(db as never, "listing-1", closer, "contacted"),
    ).rejects.toMatchObject({ code: "invalid_status_transition" });
  });
});

describe("dismissOpportunity", () => {
  it("rejects viewers", async () => {
    await expect(
      dismissOpportunity(makeWorkflowDb() as never, "listing-1", viewer, {
        reason: "dealer",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("allows any closer to flag an unassigned lead with a reason", async () => {
    const db = makeWorkflowDb();
    vi.mocked(getOpportunityDetail).mockResolvedValue({
      ...baseOpportunity,
      status: "bad_lead",
    });

    const result = await dismissOpportunity(db as never, "listing-1", closer, {
      reason: "title_issues",
    });

    expect(result.status).toBe("bad_lead");
    const action = db.actions.find((a) => a.action === "status_changed");
    expect(action?.metadata).toMatchObject({
      newStatus: "bad_lead",
      reason: "title_issues",
    });
  });

  it("requires notes when reason is other", async () => {
    await expect(
      dismissOpportunity(makeWorkflowDb() as never, "listing-1", closer, {
        reason: "other",
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});

describe("addOpportunityNote", () => {
  it("writes a note action for the assignee", async () => {
    const db = makeWorkflowDb({
      normalized_listing_id: "listing-1",
      status: "assigned",
      assigned_to_user_id: "closer-1",
      assigned_at: "2026-05-22T00:00:00.000Z",
      assigned_by_user_id: "admin-1",
      claimed_by_user_id: null,
      claimed_at: null,
      claim_expires_at: null,
      last_evaluated_by_user_id: null,
      last_evaluated_at: null,
    });

    vi.mocked(getOpportunityDetail).mockResolvedValue(baseOpportunity);

    await addOpportunityNote(db as never, "listing-1", closer, "Seller asked for best offer");

    expect(db.actions.some((a) => a.action === "note_added" && a.notes === "Seller asked for best offer")).toBe(
      true,
    );
  });
});

describe("listOpportunityActions", () => {
  it("returns actions with actor names", async () => {
    const db = makeWorkflowDb();
    await writeOpportunityAction(db as never, {
      normalizedListingId: "listing-1",
      actorUserId: "closer-1",
      action: "note_added",
      notes: "Follow up tomorrow",
    });

    const actions = await listOpportunityActions(db as never, "listing-1");

    expect(actions).toHaveLength(1);
    expect(actions[0]?.action).toBe("note_added");
    expect(actions[0]?.actorName).toBe("Closer One");
  });
});
