import { useSyncExternalStore } from "react";

import { HARDWARE_FOCUS } from "./hardwareActions";
import { partLabel } from "./partNames";
import { WORKBENCH_LAYOUT } from "./workbenchLayout";

/**
 * How Studio presents itself, the person's choice (Settings, Appearance, Interface in the
 * code interfaces; Settings, Advanced, Interface in the engineering one):
 *
 * - `engineering`: parts, checks and outputs first. The projects home, the
 *   project's overview, the title block over the viewer, Check, Make and
 *   Document, and the coding tools (branches, diffs, terminal, raw commands)
 *   put away, with things named in an engineer's words.
 * - `both`: the same engineering surfaces with every coding tool kept in view
 *   and T3 Code's own words, for an engineer who also works on the code.
 * - `code`: T3 Code's own surfaces, for working on the code behind a model.
 *
 * Offered only by a brand with a hardware focus (`brand.json` `"focus":
 * "hardware"`), which also makes `engineering` the default. Per device, like
 * the panel widths: `<html data-studio-focus>` carries it for `theme.css`
 * (`hardware`, `both` or `code`).
 */
export type StudioInterface = "engineering" | "both" | "code";

const INTERFACES: ReadonlyArray<StudioInterface> = ["engineering", "both", "code"];
const isStudioInterface = (value: unknown): value is StudioInterface =>
  INTERFACES.includes(value as StudioInterface);

/** The panel surfaces the engineering interface leaves out of its launcher and "+" menu. */
export const CODE_SURFACE_LABELS: ReadonlySet<string> = new Set([
  "Terminal",
  "Diff",
  "Pull request",
  "Linked pull requests",
  "Device",
]);

/** What the composer offers in the engineering interface, in place of T3's coding hints. */
export const ENGINEERING_COMPOSER_PLACEHOLDER =
  "Describe a change to the part, or ask about the design";

/**
 * The composer's own "/" commands in the engineering interface's words. Its "/" menu there leaves
 * out the agent's coding commands (/init, /review and the like); the skills stay.
 */
export const ENGINEERING_SLASH_DESCRIPTIONS: Readonly<Record<string, string>> = {
  plan: "Plan first: the agent says what it will do, then waits",
  default: "Back to working on the design",
};

/** The composer on a thread that has already run, in place of T3's "send follow-ups". */
export const ENGINEERING_FOLLOW_UP_PLACEHOLDER =
  "Ask for a change, a check, or attach a sketch or photo";

/**
 * Settings sections the engineering interface leaves out of its nav and
 * search. Their pages still open when visited, and the code interface lists them.
 */
export const CODE_SETTINGS_SECTIONS: ReadonlySet<string> = new Set([
  "/settings/keybindings",
  "/settings/snap-shot",
  "/settings/diffs",
  // Integrations, now Browser and Devices: the agent's browser and phone test hosts.
  "/settings/browser",
  "/settings/devices",
  "/settings/scheduled-tasks",
  "/settings/source-control",
  "/settings/worktrees",
  "/settings/connections",
  "/settings/access",
  // T3 Code's beta switches, all coding tools.
  "/settings/labs",
  // No chat is archived in Studio (its sidebar lists a project's chats), so there is no archive.
  "/settings/archived",
  // Maintenance stays: it holds the update checks. Its storage cleanup is left out of it here.
]);

/**
 * The settings pages the engineering interface gathers under one Advanced group in its sidebar,
 * in the order they are listed. Their own URLs are unchanged. To add another page to Advanced,
 * add its path here.
 */
export const ADVANCED_SETTINGS_SECTIONS: ReadonlyArray<string> = [
  "/settings/plugins",
  "/settings/diagnostics",
  // The Interface switch, the way back to the code interfaces (`StudioInterfaceSettingsPanel`).
  "/settings/interface",
];

/** The name of the engineering interface's group of ADVANCED_SETTINGS_SECTIONS. */
export const ADVANCED_SETTINGS_LABEL = "Advanced";

const ENGINEERING_SETTINGS_LABELS: Readonly<Record<string, string>> = {
  "/settings/providers": "AI agents",
};

/** A settings section's name in the given interface: engineering calls Providers "AI agents". */
export function settingsSectionLabel(path: string, label: string, engineering: boolean): string {
  return (engineering ? ENGINEERING_SETTINGS_LABELS[path] : undefined) ?? label;
}

/**
 * What a settings search result names as its place: in the engineering interface a page under
 * Advanced says "Advanced", else the section's own name.
 */
export function settingsSearchSectionLabel(
  path: string,
  label: string,
  engineering: boolean,
): string {
  return engineering && ADVANCED_SETTINGS_SECTIONS.includes(path)
    ? ADVANCED_SETTINGS_LABEL
    : settingsSectionLabel(path, label, engineering);
}

export const STUDIO_INTERFACE_AVAILABLE = WORKBENCH_LAYOUT && HARDWARE_FOCUS;

/**
 * Where the Interface switch is listed: a row of Appearance in the code interfaces, a page under
 * Advanced in the engineering one, and nowhere where Studio offers no choice. Its page
 * (`/settings/interface`) opens in every interface that offers it.
 */
export function interfaceSwitchPlacement(
  engineering: boolean,
  available: boolean,
): "appearance" | "advanced" | null {
  if (!available) return null;
  return engineering ? "advanced" : "appearance";
}
const STORAGE_KEY = "studio:interface";
const DEFAULT_INTERFACE: StudioInterface = "engineering";

function read(): StudioInterface {
  if (!STUDIO_INTERFACE_AVAILABLE) return "code";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isStudioInterface(stored) ? stored : DEFAULT_INTERFACE;
  } catch {
    return DEFAULT_INTERFACE;
  }
}

let current: StudioInterface = typeof window === "undefined" ? "code" : read();
const listeners = new Set<() => void>();

const FOCUS: Record<StudioInterface, string> = {
  engineering: "hardware",
  both: "both",
  code: "code",
};

/**
 * The stylesheet's switch: `hardware` dresses the app as an engineering tool and
 * puts the coding tools away; `both` keeps the engineering surfaces' own styles
 * (documents as spec sheets) and leaves the coding tools be.
 */
function apply() {
  if (typeof document === "undefined" || !STUDIO_INTERFACE_AVAILABLE) return;
  document.documentElement.dataset.studioFocus = FOCUS[current];
}
apply();

function notify(next: StudioInterface) {
  if (next === current) return;
  current = next;
  apply();
  for (const listener of listeners) listener();
}

export function setStudioInterface(next: StudioInterface) {
  if (!STUDIO_INTERFACE_AVAILABLE) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage is off: the choice holds until the window closes.
  }
  notify(next);
}

// Another window of the app switched: follow it.
if (typeof window !== "undefined" && STUDIO_INTERFACE_AVAILABLE) {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) notify(read());
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useStudioInterface(): StudioInterface {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => "code" as const,
  );
}

/**
 * Whether the coding tools are put away and things are named in an engineer's
 * words ("Mark done", "AI agents"), for code outside React (timeline labels):
 * the engineering interface only.
 */
export function isEngineeringInterface(): boolean {
  return current === "engineering";
}

/** Whether the coding tools are put away and things are named in an engineer's words. */
export function useEngineeringInterface(): boolean {
  return useStudioInterface() === "engineering";
}

/**
 * Whether Studio shows its engineering surfaces (the projects home, the
 * project's overview, the title block over the viewer, documents opened
 * rendered, one output followed per run), for code outside React: in the
 * engineering interface and in engineering with code tools.
 */
export function hasEngineeringSurfaces(): boolean {
  return current !== "code";
}

/** Whether Studio shows its engineering surfaces: engineering, or engineering with code tools. */
export function useEngineeringSurfaces(): boolean {
  return useStudioInterface() !== "code";
}

/**
 * A file chip's label (a file in the composer, a message or the agent's
 * reply): in the engineering interface, the part or document it is
 * ("Servo bracket drawing"), else as given. The chip still opens the file.
 */
export function useFileChipLabel(path: string, label: string): string {
  return useEngineeringInterface() ? partLabel(path) : label;
}
