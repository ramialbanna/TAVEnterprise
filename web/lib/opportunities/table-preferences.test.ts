import { describe, expect, it, beforeEach } from "vitest";

import {
  defaultColumnVisibility,
  readColumnVisibility,
  writeColumnVisibility,
} from "./table-preferences";

beforeEach(() => {
  window.localStorage.clear();
});

describe("table-preferences", () => {
  it("defaults hide region and last seen", () => {
    const visibility = defaultColumnVisibility();
    expect(visibility.region).toBe(false);
    expect(visibility.lastSeenAt).toBe(false);
    expect(visibility.vehicle).toBe(true);
  });

  it("persists column visibility", () => {
    const visibility = defaultColumnVisibility();
    visibility.region = true;
    writeColumnVisibility(visibility);
    expect(readColumnVisibility().region).toBe(true);
  });

  it("keeps vehicle and actions visible when loading stored prefs", () => {
    window.localStorage.setItem(
      "tav.opportunities.new.columns",
      JSON.stringify({ vehicle: false, actions: false, region: true }),
    );
    const visibility = readColumnVisibility();
    expect(visibility.vehicle).toBe(true);
    expect(visibility.actions).toBe(true);
    expect(visibility.region).toBe(true);
  });
});
