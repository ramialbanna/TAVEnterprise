import { describe, expect, it } from "vitest";

import {
  analyticsNavItem,
  buyerNavItems,
  isAdminRole,
  navLinkActive,
  navTitleNew,
  opsNavItems,
} from "./nav-new";

describe("nav-new", () => {
  it("buyer nav highlights my-work when view=mine", () => {
    const mine = buyerNavItems().find((i) => i.href === "/my-work");
    expect(mine).toBeDefined();
    expect(navLinkActive(mine!, "/opportunities", "?view=mine")).toBe(true);
    const opportunities = buyerNavItems().find((i) => i.href === "/opportunities");
    expect(navLinkActive(opportunities!, "/opportunities", "?view=mine")).toBe(false);
  });

  it("ops nav only for admins in shell builder", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("closer")).toBe(false);
    expect(opsNavItems()).toHaveLength(3);
  });

  it("navTitleNew uses buyer-friendly labels", () => {
    expect(navTitleNew("/dashboard")).toBe("Home");
    expect(navTitleNew("/dashboard/analytics")).toBe("Analytics");
    expect(navTitleNew("/opportunities/submit")).toBe("Submit listing");
    expect(navTitleNew("/mmr-lab")).toBe("Value a vehicle");
    expect(navTitleNew("/maxbuy")).toBe("Value a vehicle");
    expect(analyticsNavItem().label).toBe("Analytics");
  });

  it("buyer nav includes value-a-vehicle link (Max buy redirects to /mmr-lab)", () => {
    const hrefs = buyerNavItems().map((i) => i.href);
    expect(hrefs).toContain("/mmr-lab");
    expect(hrefs).not.toContain("/maxbuy");
    expect(buyerNavItems().find((i) => i.href === "/mmr-lab")?.label).toBe("Value a vehicle");
  });
});
