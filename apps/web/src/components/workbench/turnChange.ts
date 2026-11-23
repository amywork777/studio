import type { DesignChange } from "./designChanges";
import type { PartVersion } from "./versions";

/**
 * A turn's change in an engineer's words, for its "What changed" card: "Head: model and drawing
 * updated", a document "updated". The sizes come from the version comparison, never from here.
 */
export function changeSentence(change: Pick<DesignChange, "aspects">): string {
  const aspects = change.aspects;
  if (aspects.length === 0) return "updated";
  const listed =
    aspects.length === 1
      ? aspects[0]!
      : `${aspects.slice(0, -1).join(", ")} and ${aspects[aspects.length - 1]}`;
  return `${listed} updated`;
}

/**
 * The versions a turn's change sits between: the one the turn's checkpoint made (`newer`) and the
 * one before it (`older`), with the newer's number as the Versions list names it ("Version 4").
 * Null when the turn made no version of the file.
 */
export function versionAround(
  versions: ReadonlyArray<PartVersion>,
  checkpointRef: string,
): { readonly newer: string; readonly older: string | null; readonly number: number } | null {
  const at = versions.findIndex((version) => version.ref === checkpointRef);
  if (at === -1) return null;
  return {
    newer: versions[at]!.id,
    older: at === 0 ? null : versions[at - 1]!.id,
    number: at + 1,
  };
}
