import "~/index.css";

import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import themeCss from "../../../../../brand/theme.css?raw";
import type { RightPanelSurface } from "~/rightPanelStore";
import { render } from "../../../test/render";

// Studio's strip: the workbench layout and its theme (`brand/theme.css`), as the app is built.
vi.hoisted(() => vi.stubEnv("VITE_APP_LAYOUT", "workbench"));

const { RightPanelTabs } = await import("../RightPanelTabs");
type Props = Parameters<typeof RightPanelTabs>[0];

const file = (name: string): RightPanelSurface => ({
  id: `file:parts/${name}`,
  kind: "file",
  relativePath: `parts/${name}`,
  revealLine: null,
  revealRequestId: 0,
});
const TABS = [file("base.py"), file("arm.py"), file("head.py"), file("led_module.py")];

function props(onActivate: Props["onActivate"]): Props {
  const noop = () => {};
  return {
    mode: "inline",
    keybindings: [],
    getShortcutContext: () => ({
      terminalFocus: false,
      terminalOpen: false,
      previewFocus: false,
      previewOpen: false,
      isWeb: true,
      isDesktop: false,
    }),
    surfaces: TABS,
    environmentId: EnvironmentId.make("environment-local"),
    activeSurfaceId: TABS[0]!.id,
    pendingSurfaceIds: new Set(),
    previewSessions: {},
    desktopByTabId: {},
    terminalLabelsById: new Map(),
    onActivate,
    onCloseSurface: noop,
    onCloseOtherSurfaces: noop,
    onCloseSurfacesToRight: noop,
    onCloseAllSurfaces: noop,
    onCopyFilePath: noop,
    onAddBrowser: noop,
    onAddBrowserInProfile: noop,
    onAddTerminal: noop,
    onAddDiff: noop,
    onAddFiles: noop,
    onAddPullRequest: noop,
    onAddPullRequests: noop,
    onAddDevice: noop,
    browserAvailable: true,
    terminalAvailable: true,
    diffAvailable: true,
    filesAvailable: true,
    pullRequestAvailable: true,
    pullRequestsAvailable: true,
    deviceAvailable: true,
    children: null,
  } as Props;
}

function setup(width: number) {
  const style = document.createElement("style");
  style.textContent = themeCss;
  document.head.append(style);
  document.documentElement.dataset.studioFocus = "hardware";
  return {
    style,
    host: (children: React.ReactNode) => <div style={{ width }}>{children}</div>,
  };
}

describe("Studio's tab strip", () => {
  it("draws every file tab one width, the tab in front too, so a press never moves a tab", async () => {
    const { style, host } = setup(900);
    await using screen = await render(host(<RightPanelTabs {...props(vi.fn())} />));
    const widths = TABS.map(
      (tab) =>
        screen.container.querySelector<HTMLElement>(`[data-tab-surface="${tab.id}"]`)!.offsetWidth,
    );
    expect(new Set(widths).size).toBe(1);
    style.remove();
  });

  it("brings a quiet tab forward from a press on its name, and gives it no ⋯ to open a menu", async () => {
    const onActivate = vi.fn();
    const { style, host } = setup(700);
    await using screen = await render(host(<RightPanelTabs {...props(onActivate)} />));
    const quiet = screen.container.querySelector<HTMLElement>(
      `[data-tab-surface="${TABS[2]!.id}"]`,
    )!;
    expect(quiet.querySelector("[data-tab-more]")).toBeNull();
    const name = quiet.querySelector<HTMLElement>("[data-tab-title]")!;
    const box = name.getBoundingClientRect();
    const tab = quiet.getBoundingClientRect();
    // Its name's start, middle and end, the pointer resting on the tab (its close shown).
    for (const x of [2, box.width / 2, box.width - 2]) {
      onActivate.mockClear();
      await userEvent.click(quiet, { position: { x: box.left - tab.left + x, y: tab.height / 2 } });
      expect(onActivate).toHaveBeenCalledWith(TABS[2]);
    }
    style.remove();
  });
});
