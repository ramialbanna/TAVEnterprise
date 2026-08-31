import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";

import type { ApiResult } from "@/lib/app-api";
import type { AppUser } from "@/lib/app-api/schemas";

vi.mock("@/lib/app-api/client", () => ({
  getAppMe: vi.fn(),
  listOpportunitiesPage: vi.fn(),
}));

import { getAppMe, listOpportunitiesPage } from "@/lib/app-api/client";
import {
  prefetchHomeCounts,
  prefetchNavHref,
  prefetchOpportunitiesQueue,
  queueCountFilter,
  queueListFilter,
} from "./queue-prefetch";
import { DEFAULT_PAGE_SIZE } from "./table-preferences";

const mockedMe = vi.mocked(getAppMe);
const mockedList = vi.mocked(listOpportunitiesPage);

const me: ApiResult<AppUser> = {
  ok: true,
  status: 200,
  data: {
    id: "u1",
    email: "alex@texasautovalue.com",
    displayName: "Alex",
    role: "closer",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

function page() {
  return { ok: true as const, status: 200, data: { items: [], total: 0, offset: 0 } };
}

describe("queue-prefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedMe.mockResolvedValue(me);
    mockedList.mockResolvedValue(page());
  });

  it("queueListFilter defaults to the buyer table page", () => {
    expect(queueListFilter("needs_action")).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
      sort: "received_desc",
      view: "needs_action",
    });
  });

  it("queueCountFilter is a one-row total lookup", () => {
    expect(queueCountFilter("mine")).toEqual({
      limit: 1,
      offset: 0,
      sort: "received_desc",
      view: "mine",
    });
  });

  it("prefetchOpportunitiesQueue loads the default Needs action table", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchOpportunitiesQueue(client, { me });
    await vi.waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith(
        {
          limit: DEFAULT_PAGE_SIZE,
          offset: 0,
          sort: "received_desc",
          view: "needs_action",
        },
        { viewerUserId: "u1", viewerDisplayName: "Alex" },
      );
    });
  });

  it("prefetchHomeCounts loads Needs action and Mine totals", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchHomeCounts(client, { me });
    await vi.waitFor(() => {
      expect(mockedList).toHaveBeenCalledWith(queueCountFilter("needs_action"), {
        viewerUserId: "u1",
        viewerDisplayName: "Alex",
      });
      expect(mockedList).toHaveBeenCalledWith(queueCountFilter("mine"), {
        viewerUserId: "u1",
        viewerDisplayName: "Alex",
      });
    });
  });

  it("prefetchNavHref maps Home and Opportunities", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchNavHref(client, "/dashboard", me);
    prefetchNavHref(client, "/opportunities", me);
    await vi.waitFor(() => {
      expect(mockedList).toHaveBeenCalled();
    });
    const views = mockedList.mock.calls.map((call) => call[0]?.view);
    expect(views).toContain("needs_action");
  });
});
