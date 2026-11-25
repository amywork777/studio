import { describe, expect, it } from "vite-plus/test";

import type { PluginAppSurface } from "~/rightPanelStore";

import { sameFile, surfaceFile, viewTabTitle } from "./sameFile";

describe("same file", () => {
  it("knows a file named in the thread's folder and in full for one", () => {
    expect(sameFile("parts/tray.step", "/Users/a/studio-projects/clip/parts/tray.step")).toBe(true);
    expect(sameFile("parts/tray.step", "parts/tray.step")).toBe(true);
    expect(sameFile("parts/tray.step", "parts/daisy_tray.step")).toBe(false);
    expect(sameFile("parts/tray.step", "parts/tray.stl")).toBe(false);
  });

  it("reads a leading ./ as the folder itself, and a Windows path as its slashes", () => {
    expect(sameFile("./parts/tray.step", "/Users/a/studio-projects/clip/parts/tray.step")).toBe(
      true,
    );
    expect(sameFile("./parts/tray.step", "parts/tray.step")).toBe(true);
    expect(sameFile("parts\\tray.step", "C:\\work\\clip\\parts\\tray.step")).toBe(true);
    expect(sameFile("./parts/tray.step", "parts/daisy_tray.step")).toBe(false);
  });

  it("reads the file a tab shows, the agent's own views by their id", () => {
    expect(
      surfaceFile({
        id: `plugin:cad/cad/open:agent:${encodeURIComponent("parts/tray.step")}`,
        kind: "plugin-app",
        pluginId: "cad",
        server: "cad",
        tool: "open",
        title: "tray.step",
        resourceUri: "ui://cad",
        arguments: {},
      }),
    ).toBe("parts/tray.step");
    expect(surfaceFile({ id: "files", kind: "files" })).toBeNull();
  });

  it("names a view's tab by its part, and leaves a view with no file its own title", () => {
    const LED = "11111111-2222-4333-8444-555555555555";
    const view = (id: PluginAppSurface["id"], title: string): PluginAppSurface => ({
      id,
      kind: "plugin-app",
      pluginId: "cad",
      server: "cad",
      tool: "cad_open",
      title,
      resourceUri: "ui://cad",
      arguments: {},
    });
    const titles = new Map([[LED, "LED module"]]);
    expect(viewTabTitle(view(`plugin:cad:agent:${LED}`, "CAD"), titles)).toBe("LED module");
    expect(viewTabTitle(view("plugin:cad:agent:parts%2Fhead.step", "head.step"), titles)).toBe(
      "Head",
    );
    // Its name not read yet, a model stays as the view titles it; so does a view with nothing open.
    expect(viewTabTitle(view(`plugin:cad:agent:${LED}`, "CAD"), new Map())).toBe("CAD");
    expect(viewTabTitle(view("plugin:cad", "CAD"), titles)).toBe("CAD");
  });

  it("names a study's and a CAM job's result by its folder, as every one is a result.glb", () => {
    const result = (path: string): PluginAppSurface => ({
      id: `plugin:cad:agent:${encodeURIComponent(path)}`,
      kind: "plugin-app",
      pluginId: "cad",
      server: "cad",
      tool: "cad_open",
      title: "result.glb",
      resourceUri: "ui://cad",
      arguments: {},
    });
    const titles = new Map<string, string>();
    expect(viewTabTitle(result("studies/motor_bracket/result.glb"), titles)).toBe(
      "FEA · Motor bracket",
    );
    expect(viewTabTitle(result("cam/base_plate/result.glb"), titles)).toBe("CAM · Base plate");
    expect(viewTabTitle(result("cam\\base_plate\\result.glb"), titles)).toBe("CAM · Base plate");
    // A folder that only says what it holds names no study.
    expect(viewTabTitle(result("FEA/result.glb"), titles)).toBe("FEA study");
  });
});
