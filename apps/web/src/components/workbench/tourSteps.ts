import { create } from "zustand";

import { formatShortcutLabel } from "~/keybindings";
import { getLocalFileManagerName } from "~/lib/utils";

/**
 * Studio's tour, the first time a workspace opens (`StudioTour`): the project, its Overview, the
 * tabs, New, the model and how to change it by pick or by hand, how checks report, and the Toolbox,
 * each pointed at where it is on screen.
 */
export interface TourStep {
  /** The element pointed at: `[data-tour="…"]`, or another selector. */
  readonly target: string;
  readonly title: string;
  readonly body: string;
  /** What it points at is in the sidebar, which a project opens folded: the step opens it. */
  readonly sidebar?: boolean;
}

/**
 * The steps in this computer's own words (`platform`, the browser's `navigator.platform`): its file
 * manager's name, and Cmd or Ctrl for a tab's number.
 */
export const tourSteps = (platform: string): ReadonlyArray<TourStep> => [
  {
    target: '[data-tour="project"]',
    sidebar: true,
    title: "This is your project",
    body: `Everything you make lives inside it. Every project is listed here, with its chats under it: click one to fold it, or its … to rename it, back it up or show it in ${getLocalFileManagerName(platform)}.`,
  },
  {
    target: "[data-pinned-project-tab]",
    title: "The Overview",
    body: "Every file in the project in one place, like a Google Drive folder: its CAD, electronics, analysis and documents.",
  },
  {
    target: "[data-right-panel-tab-list]",
    title: "Your tabs",
    body: `What you opened lately, like browser tabs. Ctrl+Tab goes round them, and ${formatShortcutLabel(
      { key: "1", modKey: true, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false },
      platform,
    )} to 9 jumps to one.`,
  },
  {
    target: "[data-studio-new-tab]",
    title: "New",
    body: "The + after your tabs starts a part, a board or a document, as a browser's opens a new tab.",
  },
  {
    // The model view in front, whichever tab holds it (`KeptSurface`).
    target: "[data-studio-surface]:not([hidden])",
    title: "Pick, then say what to change",
    body: "Click faces, edges or parts on the model, then write what to change in Describe a change at its foot. It goes to the chat with your picks.",
  },
  {
    target: "[data-studio-cad-tools]",
    title: "Edit it by hand",
    body: "Show CAD tools opens the ribbon and the FeatureManager, as in SolidWorks. A change you make there is written into the part's script.",
  },
  {
    target: "[data-pinned-project-tab]",
    title: "How checks report",
    body: "A check says passed, warning or failed, with its numbers, on the Overview and under the part. A check that has not run says so and offers to run it.",
  },
  {
    // The Toolbox's button, the one way in, there whether the Toolbox is open or not.
    target: "[data-right-panel-toggle]",
    title: "What to do with a part",
    body: "The Toolbox button, top right, has the part's jobs: Analysis, Manufacturing and Documents. A press on one starts it in the chat.",
  },
];

const DONE_KEY = "studio:tour-done";

export function tourDone(): boolean {
  try {
    return globalThis.localStorage?.getItem(DONE_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * The tour, open or not, and its step; it opens on its own once, and from Take the tour in ⌘K. Opened
 * on its own it gives way to the chat (`hold`): a reply or a question comes first, and it comes back
 * when the chat is quiet. Asked for, it stays.
 */
export const useTourStore = create<{
  readonly open: boolean;
  readonly step: number;
  /** Opened on its own, not from ⌘K. */
  readonly auto: boolean;
  readonly start: () => void;
  readonly startFirst: () => void;
  readonly hold: () => void;
  readonly next: () => void;
  readonly finish: () => void;
}>()((set) => ({
  open: false,
  step: 0,
  auto: false,
  start: () => set({ open: true, step: 0, auto: false }),
  startFirst: () => set({ open: true, step: 0, auto: true }),
  hold: () => set((state) => (state.auto ? { open: false, step: 0, auto: false } : state)),
  next: () => set((state) => ({ step: state.step + 1 })),
  finish: () => {
    set({ open: false, step: 0, auto: false });
    try {
      globalThis.localStorage?.setItem(DONE_KEY, "1");
    } catch {
      // Shown again next time, then.
    }
  },
}));

interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A target's box as the tour points at it: null for one with no size or wholly outside the window
 * (a folded sidebar slides its rows off screen), so its card is centered rather than pointing at
 * nothing.
 */
export function shownBox(
  rect: Box | undefined,
  window: { readonly width: number; readonly height: number },
): Box | null {
  if (rect === undefined || rect.width === 0 || rect.height === 0) return null;
  const outside =
    rect.left + rect.width <= 0 ||
    rect.top + rect.height <= 0 ||
    rect.left >= window.width ||
    rect.top >= window.height;
  return outside
    ? null
    : { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * Where a step's card goes: under what it points at when there is room, else above it, its left
 * edge with the target's but kept inside the window by a margin; centered when there is no target.
 */
export function cardPlace(
  target: Box | null,
  card: { readonly width: number; readonly height: number },
  window: { readonly width: number; readonly height: number },
  gap = 12,
  margin = 16,
): { readonly top: number; readonly left: number } {
  if (target === null) {
    return {
      top: Math.max(margin, (window.height - card.height) / 2),
      left: Math.max(margin, (window.width - card.width) / 2),
    };
  }
  const below = target.top + target.height + gap;
  const top =
    below + card.height + margin <= window.height
      ? below
      : Math.max(margin, target.top - gap - card.height);
  const left = Math.min(Math.max(margin, target.left), window.width - card.width - margin);
  return { top, left: Math.max(margin, left) };
}
