import { describe, expect, it } from "vitest";
import { GATE_CODES, runHardGates } from "../src/maxbuy/gates/runGates";

const BASE_VIN = "1FTFW1ET5EFC37215";

describe("runHardGates", () => {
  it("returns null when no flags are set", () => {
    expect(runHardGates({ vin: BASE_VIN })).toBeNull();
  });

  it("returns null when all flags are explicitly false", () => {
    expect(
      runHardGates({
        vin: BASE_VIN,
        titleBranded: false,
        salvage: false,
        flood: false,
        frameStructural: false,
        odometerDiscrepancy: false,
        recallStopSale: false,
        arbitrationFlag: false,
        sourceRestricted: false,
      }),
    ).toBeNull();
  });

  it("triggers GATE_TITLE_BRAND", () => {
    expect(runHardGates({ vin: BASE_VIN, titleBranded: true })).toBe(GATE_CODES.TITLE_BRAND);
  });

  it("triggers GATE_SALVAGE", () => {
    expect(runHardGates({ vin: BASE_VIN, salvage: true })).toBe(GATE_CODES.SALVAGE);
  });

  it("triggers GATE_FLOOD", () => {
    expect(runHardGates({ vin: BASE_VIN, flood: true })).toBe(GATE_CODES.FLOOD);
  });

  it("triggers GATE_FRAME_STRUCTURAL", () => {
    expect(runHardGates({ vin: BASE_VIN, frameStructural: true })).toBe(GATE_CODES.FRAME_STRUCTURAL);
  });

  it("triggers GATE_ODOMETER", () => {
    expect(runHardGates({ vin: BASE_VIN, odometerDiscrepancy: true })).toBe(GATE_CODES.ODOMETER);
  });

  it("triggers GATE_RECALL_STOPSALE", () => {
    expect(runHardGates({ vin: BASE_VIN, recallStopSale: true })).toBe(GATE_CODES.RECALL_STOPSALE);
  });

  it("triggers GATE_ARBITRATION", () => {
    expect(runHardGates({ vin: BASE_VIN, arbitrationFlag: true })).toBe(GATE_CODES.ARBITRATION);
  });

  it("triggers GATE_SOURCE_RESTRICTED", () => {
    expect(runHardGates({ vin: BASE_VIN, sourceRestricted: true })).toBe(GATE_CODES.SOURCE_RESTRICTED);
  });

  it("title brand takes priority over lower-ranked gates", () => {
    expect(
      runHardGates({
        vin: BASE_VIN,
        titleBranded: true,
        salvage: true,
        flood: true,
        sourceRestricted: true,
      }),
    ).toBe(GATE_CODES.TITLE_BRAND);
  });

  it("salvage takes priority over flood when title brand is not set", () => {
    expect(
      runHardGates({
        vin: BASE_VIN,
        salvage: true,
        flood: true,
        arbitrationFlag: true,
      }),
    ).toBe(GATE_CODES.SALVAGE);
  });

  it("gate code values match TECHNICAL-SPEC §5.1 strings", () => {
    expect(GATE_CODES.TITLE_BRAND).toBe("GATE_TITLE_BRAND");
    expect(GATE_CODES.SALVAGE).toBe("GATE_SALVAGE");
    expect(GATE_CODES.FLOOD).toBe("GATE_FLOOD");
    expect(GATE_CODES.FRAME_STRUCTURAL).toBe("GATE_FRAME_STRUCTURAL");
    expect(GATE_CODES.ODOMETER).toBe("GATE_ODOMETER");
    expect(GATE_CODES.RECALL_STOPSALE).toBe("GATE_RECALL_STOPSALE");
    expect(GATE_CODES.ARBITRATION).toBe("GATE_ARBITRATION");
    expect(GATE_CODES.SOURCE_RESTRICTED).toBe("GATE_SOURCE_RESTRICTED");
  });
});
