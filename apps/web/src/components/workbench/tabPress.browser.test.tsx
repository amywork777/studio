import "~/index.css";

import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type { RightPanelSurface } from "~/rightPanelStore";
import { render } from "../../../test/render";
import { RightPanelTabs, type RightPanelTabsProps } from "../RightPanelTabs";

const TERMINAL: RightPanelSurface = {
  id: "terminal:1",
  kind: "terminal",
  resourceId: "1",
  terminalIds: ["1"],
  activeTerminalId: "1",
};
const DIFF: RightPanelSurface = { id: "diff", kind: "diff" };

function props(onActivate: RightPanelTabsProps["onActivate"]): RightPanelTabsProps {
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
    surfaces: [TERMINAL, DIFF],
    environmentId: EnvironmentId.make("environment-local"),
    activeSurfaceId: TERMINAL.id,
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
  };
}

describe("pressing a tab", () => {
  it("brings it forward wherever on the tab the press lands, not only on its title", async () => {
    const onActivate = vi.fn();
    await using screen = await render(<RightPanelTabs {...props(onActivate)} />);
    const tab = screen.container.querySelector<HTMLElement>(`[data-tab-surface="${DIFF.id}"]`)!;
    const middle = Math.floor(tab.offsetHeight / 2);
    // Its padding at either end, where the title button does not reach.
    for (const x of [2, tab.offsetWidth - 3]) {
      onActivate.mockClear();
      await userEvent.click(tab, { position: { x, y: middle } });
      expect(onActivate).toHaveBeenCalledWith(DIFF);
    }
  });
});
