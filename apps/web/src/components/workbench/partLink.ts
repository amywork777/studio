import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

import { knownModelScript, knownModelTitle } from "./useFolderModels";

/**
 * A part named in a job's message: a file by a link to it; a cadgen 0.8 model by a link to its
 * script, labelled as the file is so the chat shows one chip and not the name beside it. Its
 * document id is never written; before its folder is read the part is named alone.
 */
export function partLink(
  part: { readonly path: string; readonly name?: string | undefined },
  scriptOf: (id: string) => string | undefined = knownModelScript,
): string {
  if (!isDocumentId(part.path)) return serializeComposerFileLink(part.path);
  const name = part.name ?? knownModelTitle(part.path) ?? "the part";
  const script = scriptOf(part.path);
  return script === undefined ? name : serializeComposerFileLink(script);
}
