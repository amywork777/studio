/**
 * A model tab Studio opens again (after a restart) names its model by document id, and an engine
 * that has restarted holds none of them: it answers "<name> (<id>) is not saved: … run `cad run
 * <script>` to build it again" and runs nothing itself. Studio runs that command, once per model at
 * a time, and opens the tab again, so a restored tab shows its model and not the engine's words.
 */
import { runCad, type SnapshotLaunch } from "./modelPictures.ts";

const UNSAVED = /is not saved: [^`]*run `cad run ([^`]+)` to build it again/;

/** The text of a tool call's error result, its text parts joined. */
export function errorText(result: unknown): string {
  if (typeof result !== "object" || result === null) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part: unknown) =>
      typeof part === "object" &&
      part !== null &&
      typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("\n");
}

/**
 * The words after `cad run` in the engine's "is not saved" refusal, unquoted as the platform's shell
 * reads them (`records.rerun`: POSIX `shlex.quote`; on Windows the C runtime's double quotes, where a
 * single quote is part of a path). Null for any other refusal, or one built by a Python of its own.
 */
export function rebuildWords(text: string, windows: boolean): string[] | null {
  const said = UNSAVED.exec(text)?.[1];
  if (said === undefined) return null;
  const words: string[] = [];
  let word: string | null = null;
  for (let at = 0; at < said.length; at += 1) {
    const char = said[at]!;
    if (char === " ") {
      if (word !== null) words.push(word);
      word = null;
    } else if (char === "'" && !windows) {
      const end = said.indexOf("'", at + 1);
      if (end === -1) return null;
      word = (word ?? "") + said.slice(at + 1, end);
      at = end;
    } else if (char === '"') {
      word ??= "";
      for (at += 1; at < said.length && said[at] !== '"'; at += 1) {
        let slashes = 0;
        while (said[at] === "\\") {
          slashes += 1;
          at += 1;
        }
        if (said[at] === '"') {
          word += "\\".repeat(Math.floor(slashes / 2));
          if (slashes % 2 === 0) break;
          word += '"';
        } else {
          word += "\\".repeat(slashes) + (said[at] ?? "");
        }
      }
      if (said[at] !== '"') return null;
    } else {
      word = (word ?? "") + char;
    }
  }
  if (word !== null) words.push(word);
  return words.length > 0 ? words : null;
}

const building = new Map<string, Promise<void>>();

/** Runs `cad run <words>`, joining a run of the same words already under way. */
export function buildAgain(
  launch: SnapshotLaunch,
  words: ReadonlyArray<string>,
  cwd: string,
): Promise<void> {
  const key = words.join("\u0000");
  const running = building.get(key);
  if (running !== undefined) return running;
  const run = runCad({ ...launch, cwd }, [...launch.args, "run", ...words]).finally(() =>
    building.delete(key),
  );
  building.set(key, run);
  return run;
}
