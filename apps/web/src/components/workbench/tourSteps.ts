import { create } from "zustand";

/**
 * Studio's tour, five steps the first time a workspace opens (`StudioTour`): the project, its
 * Overview, the tabs, the toolbar and the Toolbox, each pointed at where it is on screen.
 */
export interface TourStep {
  /** The element pointed at: `[data-tour="…"]`, or another selector. */
  readonly target: string;
  readonly title: string;
  readonly body: string;
}

export const TOUR_STEPS: ReadonlyArray<TourStep> = [
  {
    target: '[data-tour="project"]',
    title: "This is your project",
    body: "Everything you make lives inside it. Every project is listed here, with its chats under it: click one to fold it, or its … to rename it, back it up or show it in Finder.",
  },
  {
    target: "[data-pinned-project-tab]",
    title: "The Overview",
    body: "Every file in the project in one place, like a Google Drive folder: its CAD, electronics, analysis and documents.",
  },
  {
    target: "[data-right-panel-tab-list]",
    title: "Your tabs",
    body: "What you opened lately, like browser tabs. Ctrl+Tab goes round them, and Cmd+1 to 9 jumps to one.",
  },
  {
    target: "[data-studio-toolbar]",
    title: "New, and AI or CAD",
    body: "New starts a part, a board or a document. With a part open, the AI | CAD switch chooses between asking the agent and modeling the part yourself.",
  },
  {
    // Open or folded to its icons, the Toolbox carries this.
    target: "[data-studio-toolbox]",
    title: "What to do with a part",
    body: "The Toolbox has the part's jobs: Evaluate, Manufacture and Document. A press starts one in the chat. Fold it to its icons to give the model more room.",
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
