/** Whether Home's Get started strip is folded away, kept on this device. */
const FOLDED_KEY = "studio:get-started-folded";

/**
 * Which Home to show (`StudioHome`): `start`, the Start box with New part, Import and the examples, for someone with no
 * projects (ones in Trash are not in the list); `projects`, Starred and Recent with
 * the Get started strip under them, otherwise. Until the list arrives (`loaded`) it is `projects`,
 * so someone with projects never sees the start page flash first.
 */
export function homeLayout(input: {
  readonly loaded: boolean;
  /** How many projects the list has. */
  readonly projects: number;
}): "start" | "projects" {
  return input.loaded && input.projects === 0 ? "start" : "projects";
}

/** The Get started strip's fold as storage keeps it: open when nothing is kept or storage is off. */
export function readGetStartedFolded(): boolean {
  try {
    return globalThis.localStorage?.getItem(FOLDED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeGetStartedFolded(folded: boolean): void {
  try {
    globalThis.localStorage?.setItem(FOLDED_KEY, String(folded));
  } catch {
    // Storage is full or off: the fold holds until the window closes.
  }
}
