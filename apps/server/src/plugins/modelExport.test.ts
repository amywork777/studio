// @effect-diagnostics nodeBuiltinImport:off -- the paths a `cad <type> export` is given, as the server resolves them.
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { exportCommand } from "./modelExport.ts";

const cwd = NodePath.resolve("/work/desk lamp");
const at = (path: string) => NodePath.join(cwd, path);

describe("export from a part's tab", () => {
  it("writes each file beside the part with the CAD tools' own export of its type", () => {
    expect(
      exportCommand({
        cwd,
        source: "parts/imported/motor.step",
        destinations: ["parts/imported/motor.stl", "parts/imported/motor.3mf"],
      }),
    ).toEqual({
      type: "step",
      args: [
        "step",
        "export",
        at("parts/imported/motor.step"),
        at("parts/imported/motor.stl"),
        at("parts/imported/motor.3mf"),
      ],
    });
    const id = "0b6f4a8e-58a4-4a62-9f0e-2f4c1d3b7a10";
    expect(exportCommand({ cwd, source: id, destinations: ["parts/base.step"] })).toEqual({
      type: "model",
      args: ["model", "export", id, at("parts/base.step")],
    });
  });

  it("writes an implicit part's STEP with its own command, and nothing else from it", () => {
    expect(
      exportCommand({ cwd, source: "parts/grip_pad.gsl", destinations: ["parts/grip_pad.step"] }),
    ).toEqual({
      type: "gsl",
      args: ["gsl", "step", at("parts/grip_pad.gsl"), at("parts/grip_pad.step")],
    });
    const refused = (destinations: string[]) =>
      "refused" in exportCommand({ cwd, source: "parts/grip_pad.gsl", destinations });
    expect(refused(["parts/grip_pad.stl"])).toBe(true);
    expect(refused(["parts/grip_pad.step", "parts/pad.step"])).toBe(true);
  });

  it("refuses to write the part's own file, outside the project, or a format the menu lacks", () => {
    const refused = (source: string, destinations: string[], typeless?: boolean) =>
      "refused" in exportCommand({ cwd, source, destinations, typeless });
    expect(refused("parts/motor.step", ["parts/motor.step"])).toBe(true);
    expect(refused("parts/motor.step", ["../elsewhere/motor.stl"])).toBe(true);
    expect(refused("parts/motor.step", ["parts/motor.glb"])).toBe(true);
    expect(refused("../motor.step", ["parts/motor.stl"])).toBe(true);
    expect(refused("parts/base.py", ["parts/base.step"])).toBe(true);
    expect(refused("parts/motor.step", [])).toBe(true);
    expect(refused("parts/motor.step", ["parts/motor.stl"], true)).toBe(true);
  });
});
