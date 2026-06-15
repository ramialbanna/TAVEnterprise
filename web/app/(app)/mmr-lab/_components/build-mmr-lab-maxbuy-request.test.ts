import { describe, expect, it } from "vitest";

import { buildMmrLabMaxbuyRequest } from "./build-mmr-lab-maxbuy-request";

describe("buildMmrLabMaxbuyRequest", () => {
  it("builds VIN path with lane ask as asking_price", () => {
    const built = buildMmrLabMaxbuyRequest({ kind: "vin", vin: "1FT7W2BT4KED81759" }, "21000");
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    expect(built.body).toMatchObject({
      contract_version: "1.0.0",
      vin: "1FT7W2BT4KED81759",
      asking_price: 21000,
    });
    expect(built.askingPrice).toBe(21000);
  });

  it("builds YMM path with style as trim and no mileage unless adjusted", () => {
    const built = buildMmrLabMaxbuyRequest(
      {
        kind: "ymm",
        selection: {
          year: "2026",
          make: "TESLA",
          model: "MODEL Y AWD",
          style: "4D SUV PERFORMANCE",
        },
      },
      "",
    );
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    expect(built.body).toMatchObject({
      contract_version: "1.0.0",
      year: 2026,
      make: "TESLA",
      model: "MODEL Y AWD",
      trim: "4D SUV PERFORMANCE",
    });
    expect(built.body.vin).toBeUndefined();
    expect(built.body.mileage).toBeUndefined();
    expect(built.askingPrice).toBeNull();
  });
});
