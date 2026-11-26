import { create } from "zustand";

const PINS_KEY = "studio:toolbox-pins";

/** The jobs the person pinned, by id, in the order pinned, on this device. */
function readToolboxPins(): ReadonlyArray<string> {
  try {
    const stored: unknown = JSON.parse(globalThis.localStorage?.getItem(PINS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeToolboxPins(pins: ReadonlyArray<string>): void {
  try {
    globalThis.localStorage?.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    // Storage is full or off: the pins hold until the window closes.
  }
}

/** Pins a job at the end, or unpins it where it is. */
export const togglePin = (pins: ReadonlyArray<string>, id: string): ReadonlyArray<string> =>
  pins.includes(id) ? pins.filter((pinned) => pinned !== id) : [...pins, id];

interface ToolboxPinsState {
  readonly pins: ReadonlyArray<string>;
  readonly toggle: (id: string) => void;
}

/**
 * The person's own tools: one list for the Toolbox popup's Featured tab and the Toolbox page's Your
 * tools shelf, each tool starred in either.
 */
export const useToolboxPins = create<ToolboxPinsState>((set, get) => ({
  pins: readToolboxPins(),
  toggle: (id) => {
    const pins = togglePin(get().pins, id);
    writeToolboxPins(pins);
    set({ pins });
  },
}));
