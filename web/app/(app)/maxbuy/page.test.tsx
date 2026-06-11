import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { redirect } from "next/navigation";

import MaxBuyPage from "./page";

describe("/maxbuy page", () => {
  it("redirects to /mmr-lab (OPEN-MLB-4)", () => {
    MaxBuyPage();
    expect(redirect).toHaveBeenCalledWith("/mmr-lab");
  });
});
