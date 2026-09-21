import { describe, expect, it } from "vitest";

import { resolveCatalogStyleFromEvidence } from "../resolveCatalogStyleFromEvidence";

describe("resolveCatalogStyleFromEvidence", () => {
  const styles = [
    "4D SEDAN AMG GLC 43 4MATIC",
    "4D SUV GLC 300",
    "4D SUV GLC 300 4MATIC",
  ];

  it("does not fall back to the first AMG style when leftover evidence is 300", () => {
    const resolved = resolveCatalogStyleFromEvidence(styles, "300 sport");
    expect(resolved?.style).toMatch(/GLC 300/);
    expect(resolved?.style).not.toMatch(/AMG/);
  });
});
