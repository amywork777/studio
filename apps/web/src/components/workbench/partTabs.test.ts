import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { RightPanelSurface } from "~/rightPanelStore";
import {
  forgetPartDocuments,
  notePartDocument,
  openPartTab,
  partnerTab,
  partTabMerges,
} from "./partTabs";

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
  afterEach(() => {
    forgetPartDocuments();
    vi.unstubAllGlobals();
  });

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

  // 0.1.18's final check: an M3x8 STEP tab and its "M3x8 part" tab, kept from an earlier build,
  // stayed two tabs, and pressing the STEP tab first landed on the other.
  it("merges a part open as two tabs, its document's tab taking the STEP tab's place", () => {
    const overview: RightPanelSurface = { id: "files", kind: "files" };
    const other: RightPanelSurface = {
      id: "plugin:cad:agent:parts%2Fbase.step",
      kind: "plugin-app",
      pluginId: "cad",
      server: "cad",
      tool: "cad_open",
      title: "Base",
      resourceUri: "ui://cad/view",
      arguments: {},
    };
    const tabs = [overview, step, other, model];
    expect(partTabMerges(tabs, step.id)).toEqual([]);
    notePartDocument("parts/led_module.step", DOC);
    expect(partTabMerges(tabs, step.id)).toEqual([
      { keep: model.id, drop: step.id, index: 1, front: true },
    ]);
    expect(partTabMerges(tabs, other.id)).toEqual([
      { keep: model.id, drop: step.id, index: 1, front: false },
    ]);
    expect(partTabMerges([overview, step, other], step.id)).toEqual([]);
  });

  it("keeps a pairing between runs, so tabs restored from before still merge", async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    });
    notePartDocument("parts/led_module.step", DOC);
    vi.resetModules();
    const fresh = await import("./partTabs");
    expect(fresh.partTabMerges([step, model], null)).toEqual([
      { keep: model.id, drop: step.id, index: 0, front: false },
    ]);
  });
});
