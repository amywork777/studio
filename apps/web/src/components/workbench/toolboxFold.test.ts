import { beforeEach, describe, expect, it } from "vite-plus/test";

import { selectToolboxFolded, useToolboxFold } from "./toolboxFold";

const folded = () => selectToolboxFolded(useToolboxFold.getState());

describe("useToolboxFold", () => {
  beforeEach(() => {
    useToolboxFold.setState({
      chosen: false,
      narrow: false,
      openedNarrow: false,
      openAsked: false,
    });
  });

  it("folds and opens on a wide panel, as the person chose", () => {
    useToolboxFold.getState().setFolded(true);
    expect(folded()).toBe(true);
    useToolboxFold.getState().setFolded(false);
    expect(folded()).toBe(false);
  });

  it("starts folded on a narrow panel until opened there, and forgets that once wide again", () => {
    useToolboxFold.getState().setNarrow(true);
    expect(folded()).toBe(true);
    useToolboxFold.getState().setFolded(false);
    expect(folded()).toBe(false);
    useToolboxFold.getState().setNarrow(false);
    useToolboxFold.getState().setNarrow(true);
    expect(folded()).toBe(true);
  });

  it("opened from the title bar with the panel shut, stays open whatever width the panel opens at", () => {
    useToolboxFold.setState({ chosen: true });
    useToolboxFold.getState().openWithPanel();
    // The panel opens narrow: the Toolbox measures it, and is open all the same.
    useToolboxFold.getState().setNarrow(true);
    expect(folded()).toBe(false);
    // Folded again from the title bar, it folds.
    useToolboxFold.getState().setFolded(true);
    expect(folded()).toBe(true);
  });
});
