// @effect-diagnostics nodeBuiltinImport:off - writes a drawing's pages with Node's own APIs.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

/**
 * A PDF drawing's pages, which the page draws with pdf.js and hands here to keep beside the PDF
 * (`apps/web/src/components/workbench/drawingPages.ts`): its pictures and its words, so any agent
 * can read every sheet. It writes only those files, only in a `-pages` folder, and writes them
 * again when the drawing is read again: they are made from the PDF, never the person's own.
 */

const PAGE_FILE = /^(?:page-\d{2,4}\.png|pages\.json)$/;

export interface DrawingPageFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export async function writeDrawingPages(
  folder: string,
  files: ReadonlyArray<DrawingPageFile>,
): Promise<ReadonlyArray<string>> {
  if (!NodePath.isAbsolute(folder) || !NodePath.basename(folder).endsWith("-pages")) {
    throw new Error("A drawing's pages go in its own -pages folder.");
  }
  if (!files.every((file) => PAGE_FILE.test(file.name) && file.bytes instanceof Uint8Array)) {
    throw new Error("Only a drawing's page pictures and its pages.json are written there.");
  }
  await NodeFSP.mkdir(folder, { recursive: true });
  for (const file of files) {
    await NodeFSP.writeFile(NodePath.join(folder, file.name), file.bytes);
  }
  return files.map((file) => file.name);
}
