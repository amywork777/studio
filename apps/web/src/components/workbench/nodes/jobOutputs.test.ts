import { describe, expect, it } from "vite-plus/test";

// Complete presets as the gcode skill's orca_presets.py wrote them from Bambu Studio's own
// profiles: an X1 Carbon with a 0.4 mm nozzle, 0.20mm Standard, Bambu PLA Basic.
import FILAMENT from "./__fixtures__/outputs/slice/motor_plate/filament-1.json?raw";
import PRINTER from "./__fixtures__/outputs/slice/motor_plate/printer.json?raw";
import PROCESS from "./__fixtures__/outputs/slice/motor_plate/process.json?raw";
import { outputFolder, outputOf, printSettings } from "./jobOutputs";

describe("job outputs", () => {
  it("keeps what each job makes under outputs/, by job and part", () => {
    expect(outputFolder("slice", "parts/motor_plate.py")).toBe("outputs/slice/motor_plate");
    expect(outputFolder("dxf", "parts/imported/bracket.step")).toBe("outputs/dxf/bracket");
    expect(outputOf("outputs/slice/motor_plate/motor_plate.gcode")).toEqual({
      job: "slice",
      stem: "motor_plate",
    });
    expect(outputOf("outputs/slice/motor_plate")).toBeNull();
    expect(outputOf("cam/motor_plate.top.ngc")).toBeNull();
  });

  it("reads the settings a part was sliced with from its saved presets", () => {
    const presets = new Map([
      ["printer.json", PRINTER],
      ["process.json", PROCESS],
      ["filament-1.json", FILAMENT],
    ]);
    expect(printSettings(presets)).toEqual([
      { label: "Printer", value: "Bambu Lab X1 Carbon" },
      { label: "Nozzle", value: "0.4 mm" },
      { label: "Settings", value: "0.20mm Standard @BBL X1C" },
      { label: "Layer height", value: "0.2 mm" },
      { label: "Walls", value: "2" },
      { label: "Infill", value: "15%" },
      { label: "Filament", value: "Bambu PLA Basic @BBL X1C" },
      { label: "Nozzle temperature", value: "220 °C" },
    ]);
  });

  it("gives only what is there", () => {
    expect(printSettings(new Map([["process.json", '{"layer_height": "0.16"}']]))).toEqual([
      { label: "Layer height", value: "0.16 mm" },
    ]);
    expect(printSettings(new Map([["printer.json", "not json"]]))).toEqual([]);
  });
});
