import { afterEach, describe, expect, it } from "vite-plus/test";

import type { RightPanelSurface } from "~/rightPanelStore";
import { forgetPartDocuments, notePartDocument, openPartTab, partnerTab } from "./partTabs";

const DOC = "93371fb8-0b8e-4d8e-9d1e-6f6c2a1b7c44";
const step: RightPanelSurface = {
  id: "plugin:cad:agent:parts%2Fled_module.step",
  kind: "plugin-app",
  pluginId: "cad",
  server: "cad",
  tool: "cad_open",
  title: "LED module",
  resourceUri: "ui://cad/view",
  arguments: {},
};
const model: RightPanelSurface = {
  id: `plugin:cad:agent:${DOC}`,
  kind: "plugin-app",
  pluginId: "cad",
  server: "cad",
  tool: "cad_open",
  title: "LED module",
  resourceUri: "ui://cad/view",
  arguments: {},
};

describe("one tab per part", () => {
  afterEach(forgetPartDocuments);

  it("finds a file's own tab however its path is written", () => {
    expect(openPartTab([step], "/work/lamp/parts/led_module.step")?.id).toBe(step.id);
  });

  it("finds a STEP's built document tab, and the document's STEP tab, once they are paired", () => {
    expect(openPartTab([model], "parts/led_module.step")).toBeNull();
    notePartDocument("parts/led_module.step", DOC);
    expect(openPartTab([model], "/work/lamp/parts/led_module.step")?.id).toBe(model.id);
    expect(openPartTab([step], DOC)?.id).toBe(step.id);
  });

  it("names only the other tab as the partner, never the tab being opened", () => {
    notePartDocument("parts/led_module.step", DOC);
    expect(partnerTab([step, model], "parts/led_module.step", step.id)?.id).toBe(model.id);
    expect(partnerTab([step], "parts/led_module.step", step.id)).toBeNull();
    expect(partnerTab([step, model], "parts/other.step")).toBeNull();
  });
});
