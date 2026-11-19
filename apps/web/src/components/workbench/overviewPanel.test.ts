import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  type PluginAppSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";
import {
  frontTab,
  overviewStanding,
  showChat,
  showOverview,
  showProject,
  takeOpeningProject,
  useOpeningProjects,
} from "./overviewPanel";
import { onFoldSidebarForPart } from "./sidebarFold";
import { setSimpleView, useSimpleViewStore } from "./simpleView";
import { openFromOverview, openPartInCad } from "./useOpenInWorkbench";

const THREAD = scopeThreadRef(EnvironmentId.make("environment-local"), ThreadId.make("thread-1"));

const BRACKET: PluginAppSurface = {
  id: "plugin:text-to-cad/cad/cad_open:bracket",
  kind: "plugin-app",
  pluginId: "text-to-cad",
  server: "cad",
  tool: "cad_open",
  title: "Bracket",
  resourceUri: "ui://cad/viewer",
  arguments: {},
};

const panel = () => selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD);

describe("overviewStanding", () => {
  const standing = () => overviewStanding(useRightPanelStore.getState().byThreadKey, THREAD);

  beforeEach(() => {
    useRightPanelStore.setState({ byThreadKey: {}, threadPanelVisibilityByThreadKey: {} });
  });

  it("is alone across the window, beside once the chat comes back", () => {
    expect(standing()).toBeNull();

    showOverview(THREAD);
    expect(standing()).toBe("alone");

    showChat(THREAD);
    expect(standing()).toBe("beside");
  });

  it("is nothing with a part in front, even across the window", () => {
    useRightPanelStore.getState().openPluginApp(THREAD, BRACKET);
    useRightPanelStore.getState().setMaximized(THREAD, true);

    expect(standing()).toBeNull();
    expect(overviewStanding(useRightPanelStore.getState().byThreadKey, null)).toBeNull();
  });
});

describe("opening a project", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ byThreadKey: {}, threadPanelVisibilityByThreadKey: {} });
    useOpeningProjects.setState({ threads: new Set() });
    setSimpleView(true);
  });

  it("brings back the part left open, beside the chat, in CAD mode", () => {
    useRightPanelStore.getState().openPluginApp(THREAD, BRACKET);
    // Left on its Overview across the window last time.
    showOverview(THREAD);

    showProject(THREAD);

    expect(panel().activeSurfaceId).toBe(BRACKET.id);
    expect(panel().maximized).toBeUndefined();
    expect(useSimpleViewStore.getState().on).toBe(false);
    expect(takeOpeningProject(THREAD)).toBe(false);
  });

  it("with no part open, waits once for the workspace to find its main part", () => {
    showProject(THREAD);

    expect(panel().surfaces).toEqual([]);
    expect(takeOpeningProject(THREAD)).toBe(true);
    expect(takeOpeningProject(THREAD)).toBe(false);
  });
});

describe("going between the panel's tabs", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ byThreadKey: {}, threadPanelVisibilityByThreadKey: {} });
  });

  it("keeps the panel's size: the Overview tab opens beside the chat when the panel is there", () => {
    useRightPanelStore.getState().openPluginApp(THREAD, BRACKET);
    useRightPanelStore.getState().open(THREAD, "files");
    frontTab(THREAD, BRACKET);
    frontTab(THREAD, { id: "files", kind: "files" });
    expect([panel().activeSurfaceId, panel().maximized]).toEqual(["files", undefined]);
    frontTab(THREAD, BRACKET);
    expect([panel().activeSurfaceId, panel().maximized]).toEqual([BRACKET.id, undefined]);
  });

  it("steps back beside the chat once, leaving an Overview opened across the window", () => {
    useRightPanelStore.getState().openPluginApp(THREAD, BRACKET);
    showOverview(THREAD);
    expect(panel().maximized).toBe(true);
    frontTab(THREAD, BRACKET);
    expect([panel().activeSurfaceId, panel().maximized]).toEqual([BRACKET.id, undefined]);
  });

  it("leaves a part the person spread across the window so", () => {
    useRightPanelStore.getState().openPluginApp(THREAD, BRACKET);
    useRightPanelStore.getState().open(THREAD, "files");
    frontTab(THREAD, BRACKET);
    useRightPanelStore.getState().setMaximized(THREAD, true);
    frontTab(THREAD, { id: "files", kind: "files" });
    frontTab(THREAD, BRACKET);
    expect(panel().maximized).toBe(true);
  });
});

describe("opening a file from the Overview", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ byThreadKey: {}, threadPanelVisibilityByThreadKey: {} });
  });

  it("keeps the panel across the window, however it got there", () => {
    showOverview(THREAD);
    openFromOverview(undefined, THREAD, "docs/prd.md");
    expect(panel().maximized).toBe(true);

    useRightPanelStore.getState().open(THREAD, "files");
    useRightPanelStore.getState().setMaximized(THREAD, true);
    openFromOverview(undefined, THREAD, "docs/fmea.md");
    expect(panel().maximized).toBe(true);
  });

  it("stays across the window going back and forth between the tabs after", () => {
    useRightPanelStore.getState().openPluginApp(THREAD, BRACKET);
    showOverview(THREAD);
    openFromOverview(undefined, THREAD, "docs/prd.md");
    frontTab(THREAD, { id: "files", kind: "files" });
    frontTab(THREAD, BRACKET);
    expect(panel().maximized).toBe(true);
  });

  it("folds the sidebar for a part a viewer took, and leaves it for a document", () => {
    const LED = "11111111-2222-4333-8444-555555555555";
    const plugins = [
      {
        id: "text-to-cad",
        displayName: "text-to-cad",
        enabled: true,
        views: [{ tool: "cad_open", server: "cad", title: "CAD", resourceUri: "ui://cad/viewer" }],
      },
    ] as unknown as Parameters<typeof openPartInCad>[0];
    let folds = 0;
    const stop = onFoldSidebarForPart(() => {
      folds += 1;
    });
    openPartInCad(undefined, THREAD, "docs/prd.md");
    openFromOverview(undefined, THREAD, "docs/prd.md");
    expect(folds).toBe(0);
    openPartInCad(plugins, THREAD, LED);
    openFromOverview(plugins, THREAD, LED);
    expect(folds).toBe(2);
    stop();
  });

  it("sends a picture opened before the plugins load to the view that claims it", async () => {
    const plugins = [
      {
        id: "text-to-cad",
        displayName: "text-to-cad",
        enabled: true,
        views: [
          {
            tool: "cad_open_file",
            server: "cad",
            title: "CAD",
            resourceUri: "ui://cad/viewer",
            entrypoints: [{ type: "file", extensions: ["png", "pdf"] }],
          },
        ],
      },
    ] as unknown as Parameters<typeof openPartInCad>[0];
    let folds = 0;
    const stop = onFoldSidebarForPart(() => {
      folds += 1;
    });
    const listed = Promise.resolve(plugins);
    openFromOverview(undefined, THREAD, "sketches/bracket.png", () => listed);
    await listed;
    expect(panel().surfaces.map((surface) => surface.kind)).toEqual(["plugin-app"]);
    expect(folds).toBe(1);
    // With the list in hand, a file no view claims opens as a document at once.
    openFromOverview(plugins, THREAD, "docs/prd.md", () => listed);
    expect(panel().surfaces.map((surface) => surface.kind)).toEqual(["plugin-app", "file"]);
    stop();
  });

  it("leaves a part picked anywhere else stepping back beside the chat", () => {
    showOverview(THREAD);
    openPartInCad(undefined, THREAD, "docs/prd.md");
    expect(panel().maximized).toBeUndefined();
  });
});
