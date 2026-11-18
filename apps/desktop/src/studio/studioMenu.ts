// Studio's items in the desktop Help menu, spread in by `DesktopApplicationMenu.ts` with one line.
import * as Effect from "effect/Effect";
import type * as Electron from "electron";

import * as ElectronShell from "../electron/ElectronShell.ts";

/** The Discord Studio shares with text-to-cad, as the sidebar's Feedback opens it (`TEXT_TO_CAD_DISCORD`). */
export const FEEDBACK_URL = "https://discord.gg/5FGB9DwJYU";

const openFeedback = Effect.gen(function* () {
  const shell = yield* ElectronShell.ElectronShell;
  yield* shell.openExternal(FEEDBACK_URL);
}).pipe(Effect.withSpan("desktop.menu.openFeedback"));

/** After T3's own Help items; `run` is the menu's runner, which logs a failed action. */
export const helpMenuItems = (
  run: (action: string, effect: Effect.Effect<void, never, ElectronShell.ElectronShell>) => void,
): Electron.MenuItemConstructorOptions[] => [
  { type: "separator" },
  {
    label: "Feedback on Discord",
    click: () => run("open-feedback", openFeedback),
  },
];
