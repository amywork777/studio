import { beforeEach, describe, expect, it } from "vite-plus/test";

import { cardPlace, shownBox, tourSteps, useTourStore } from "./tourSteps";

const card = { width: 320, height: 160 };
const window = { width: 1200, height: 800 };

describe("tour", () => {
  it("has eight steps, the model and its checks among them, each pointing somewhere, the last at the Toolbox", () => {
    for (const platform of ["MacIntel", "Win32"]) {
      const steps = tourSteps(platform);
      expect(steps).toHaveLength(8);
      expect(steps.at(-1)?.target).toBe("[data-right-panel-toggle]");
      expect(steps.every((step) => step.target !== "" && !step.body.includes("—"))).toBe(true);
    }
  });

  it("names the file manager and the keys of the computer it is on", () => {
    const words = (platform: string) =>
      tourSteps(platform)
        .map((step) => step.body)
        .join(" ");
    expect(words("MacIntel")).toContain("show it in Finder.");
    expect(words("MacIntel")).toContain("and ⌘1 to 9 jumps to one.");
    expect(words("Win32")).toContain("show it in File Explorer.");
    expect(words("Win32")).toContain("Ctrl+Tab goes round them, and Ctrl+1 to 9 jumps to one.");
    expect(words("Win32")).not.toMatch(/Finder|Cmd|⌘/);
  });

  it("puts a card under what it points at, or above when there is no room", () => {
    expect(cardPlace({ top: 40, left: 100, width: 200, height: 40 }, card, window)).toEqual({
      top: 92,
      left: 100,
    });
    expect(cardPlace({ top: 700, left: 100, width: 200, height: 40 }, card, window)).toEqual({
      top: 528,
      left: 100,
    });
  });

  it("points at nothing a folded sidebar holds off screen, or that has no size", () => {
    const row = { top: 120, left: 8, width: 240, height: 28 };
    expect(shownBox(row, window)).toEqual(row);
    // The folded sidebar's row, slid left of the window.
    expect(shownBox({ ...row, left: -260 }, window)).toBeNull();
    expect(shownBox({ ...row, width: 0 }, window)).toBeNull();
    expect(shownBox(undefined, window)).toBeNull();
  });

  it("keeps a card inside the window, and centers it with nothing to point at", () => {
    expect(cardPlace({ top: 40, left: 1100, width: 80, height: 30 }, card, window).left).toBe(864);
    expect(cardPlace(null, card, window)).toEqual({ top: 320, left: 440 });
  });

  describe("giving way to the chat", () => {
    beforeEach(() => {
      useTourStore.setState({ open: false, step: 0, auto: false });
    });

    it("closes a tour that opened on its own, without counting it as seen", () => {
      useTourStore.getState().startFirst();
      useTourStore.getState().next();
      useTourStore.getState().hold();
      expect(useTourStore.getState()).toMatchObject({ open: false, step: 0, auto: false });
    });

    it("leaves a tour the person asked for", () => {
      useTourStore.getState().start();
      useTourStore.getState().next();
      useTourStore.getState().hold();
      expect(useTourStore.getState()).toMatchObject({ open: true, step: 1 });
    });
  });
});
