import { describe, expect, it } from "vitest";

import {
  buildMmrLabMaxbuyRequest,
  mmrVinSessionFromResult,
} from "./build-mmr-lab-maxbuy-request";

const F450_VIN = "1FT8W4DT8JEB57132"; // digit 10 = "J" → 2018

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

  it("builds VIN path with Cox YMM fallback fields when present", () => {
    const built = buildMmrLabMaxbuyRequest(
      {
        kind: "vin",
        vin: "1FT7W2BT4KED81759",
        year: 2026,
        make: "TESLA",
        model: "MODEL Y AWD",
        trim: "4D SUV PERFORMANCE",
      },
      "",
    );
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    expect(built.body).toMatchObject({
      contract_version: "1.0.0",
      vin: "1FT7W2BT4KED81759",
      year: 2026,
      make: "TESLA",
      model: "MODEL Y AWD",
      trim: "4D SUV PERFORMANCE",
    });
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

  describe("mmrVinSessionFromResult — VIN year-decode fallback", () => {
    it("prefers Cox year/make/model when present", () => {
      const session = mmrVinSessionFromResult(F450_VIN, {
        mmrValue: 50000,
        confidence: "high",
        method: "vin",
        year: 2018,
        make: "Ford",
        model: "F-450",
        trim: "PLATINUM",
      } as never);
      expect(session).toEqual({
        kind: "vin",
        vin: F450_VIN,
        year: 2018,
        make: "Ford",
        model: "F-450",
        trim: "PLATINUM",
      });
    });

    it("falls back to VIN digit-10 decode when Cox omits vehicle identity", () => {
      // Cox payload had no year/make/model — the session must still carry the
      // decoded year so the MaxBuy body reaches the worker with a year.
      const session = mmrVinSessionFromResult(F450_VIN, {
        mmrValue: 50000,
        confidence: "high",
        method: "vin",
      } as never);
      expect(session.kind).toBe("vin");
      if (session.kind !== "vin") return;
      expect(session.year).toBe(2018);
      expect(session.make).toBeUndefined();
      expect(session.model).toBeUndefined();
    });

    it("forwards decoded year into the MaxBuy body on the VIN path", () => {
      const session = mmrVinSessionFromResult(F450_VIN, {
        mmrValue: 50000,
        confidence: "high",
        method: "vin",
      } as never);
      const built = buildMmrLabMaxbuyRequest(session, "");
      expect("error" in built).toBe(false);
      if ("error" in built) return;
      expect(built.body.vin).toBe(F450_VIN);
      expect(built.body.year).toBe(2018);
    });
  });
});
