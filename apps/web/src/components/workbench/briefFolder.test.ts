import { describe, expect, it } from "vite-plus/test";

import { EMPTY_BRIEF, propertiesLine, setupRequest } from "./briefFolder";

describe("setup requests", () => {
  it("asks the agent for one change in plain words", () => {
    expect(setupRequest("material", "PETG")).toBe("Change the project's material to PETG.");
    expect(setupRequest("units", "in")).toBe("Change the project's units to inches.");
    expect(setupRequest("quantity", "20")).toBe("Change the project's quantity to 20.");
    expect(setupRequest("material", "")).toBe("Clear the project's material.");
    expect(setupRequest("standard", "ASME")).toBe(
      "Change the project's drafting standard to ASME Y14.5.",
    );
    expect(setupRequest("generalTolerance", "ISO 2768-f")).toBe(
      "Change the project's general tolerance to ISO 2768-f.",
    );
    expect(setupRequest("generalTolerance", "")).toBe("Clear the project's general tolerance.");
  });
});

describe("the project's properties line", () => {
  it("reads as document properties, the standard's usual tolerance where none is set", () => {
    expect(propertiesLine({ ...EMPTY_BRIEF, material: "PLA" })).toBe("mm · ISO · ISO 2768-m · PLA");
    expect(
      propertiesLine({ ...EMPTY_BRIEF, units: "in", standard: "ASME", generalTolerance: "±.010" }),
    ).toBe("in · ASME Y14.5 · ±.010");
  });
});
