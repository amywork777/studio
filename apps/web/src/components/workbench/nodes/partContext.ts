/**
 * What each part must meet (a load, a material, a fit), kept beside the project's brief so every
 * chat and the agent can read it: `{ "<script path>": ["line", ...] }`.
 */
export type PartContext = Readonly<Record<string, ReadonlyArray<string>>>;

export const CONTEXT_FILE = "brief/part-context.json";

/** The file's lines by script; anything else in it is left out, and a broken file reads as empty. */
export function readPartContext(contents: string): PartContext {
  try {
    const value: unknown = JSON.parse(contents);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([script, lines]) =>
        Array.isArray(lines)
          ? [
              [
                script,
                lines.filter(
                  (line): line is string => typeof line === "string" && line.trim() !== "",
                ),
              ],
            ]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

/** The file's text: scripts in order, parts with nothing to meet left out. */
export function writePartContext(context: PartContext): string {
  const kept = Object.entries(context)
    .filter(([, lines]) => lines.length > 0)
    .toSorted(([a], [b]) => a.localeCompare(b));
  return `${JSON.stringify(Object.fromEntries(kept), null, 2)}\n`;
}
