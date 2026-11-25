import { Util } from "pdfjs-dist";

import { openPdf } from "../files/pdfDocument";
import { toastManager } from "../ui/toast";
import {
  type Callout,
  calloutsOf,
  pagePictureName,
  pagesFolderOf,
  pictureScale,
  runFromMatrix,
} from "./drawingPagesText";
import { readStudioImport } from "./studioImportBridge";

/**
 * A PDF drawing as pages any agent can read, drawn here with pdf.js and kept beside the PDF in its
 * `-pages` folder: each sheet's picture, and its callouts' words and boxes where it is vector, not
 * scanned. `pages.json` is written last, so its being there means the pages are whole.
 */

export interface DrawingPage {
  readonly page: number;
  readonly picture: string;
  /** The picture's size in pixels. */
  readonly pixels: readonly [number, number];
  /** The sheet's size in inches, as printed: a scale on the drawing reads against it. */
  readonly sheetInches: readonly [number, number];
  /** False for a scanned sheet: no words, read the picture. */
  readonly words: boolean;
  readonly callouts: ReadonlyArray<Callout>;
}

export interface DrawingPagesIndex {
  readonly source: string;
  readonly pageCount: number;
  readonly pages: ReadonlyArray<DrawingPage>;
}

const pngOf = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error("No picture")) : resolve(blob)),
      "image/png",
    ),
  );

/** Draws every page of the PDF and reads its words, one page at a time. */
async function drawPages(
  bytes: ArrayBuffer,
  source: string,
  onPage?: (page: number, pageCount: number) => void,
): Promise<{
  readonly index: DrawingPagesIndex;
  readonly files: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array }>;
}> {
  const task = openPdf(bytes);
  const document = await task.promise;
  const files: Array<{ readonly name: string; readonly bytes: Uint8Array }> = [];
  const pages: DrawingPage[] = [];
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      onPage?.(number, document.numPages);
      const page = await document.getPage(number);
      const sheet = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: pictureScale(sheet.width, sheet.height) });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("This computer could not draw the drawing's pages.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const picture = pagePictureName(number, document.numPages);
      files.push({
        name: picture,
        bytes: new Uint8Array(await (await pngOf(canvas)).arrayBuffer()),
      });
      // Free the sheet's pixels before the next one: a 36 in sheet is about 80 MB of them.
      canvas.width = 0;
      canvas.height = 0;
      const text = await page.getTextContent();
      const runs = text.items.flatMap((item) =>
        "str" in item && item.str.trim() !== ""
          ? [
              runFromMatrix(
                item.str,
                Util.transform(sheet.transform, item.transform) as [
                  number,
                  number,
                  number,
                  number,
                  number,
                  number,
                ],
                item.width,
              ),
            ]
          : [],
      );
      pages.push({
        page: number,
        picture,
        pixels: [Math.ceil(viewport.width), Math.ceil(viewport.height)],
        sheetInches: [
          Math.round((sheet.width / 72) * 100) / 100,
          Math.round((sheet.height / 72) * 100) / 100,
        ],
        words: runs.length > 0,
        callouts: calloutsOf(runs, sheet),
      });
      page.cleanup();
    }
  } finally {
    void task.destroy();
  }
  const index = { source, pageCount: pages.length, pages };
  files.push({ name: "pages.json", bytes: new TextEncoder().encode(`${JSON.stringify(index)}\n`) });
  return { index, files };
}

/**
 * Keeps a PDF's pages beside it in the project (`brief/references/FL-100-pages/`), from the
 * desktop app; null outside it, where nothing is written.
 */
async function keepDrawingPages(
  folder: string,
  pdf: string,
  bytes: ArrayBuffer,
  onPage?: (page: number, pageCount: number) => void,
): Promise<DrawingPagesIndex | null> {
  const write = readStudioImport()?.writeDrawingPages;
  if (write === undefined) return null;
  const { index, files } = await drawPages(bytes, pdf, onPage);
  await write(`${folder.replace(/[\\/]+$/, "")}/${pagesFolderOf(pdf)}`, files);
  return index;
}

/**
 * After Attach copies files into References: each PDF's pages, drawn in the background with a
 * toast that counts the sheets, so a 29-sheet set never holds up the message. A failure says so
 * and the PDF stays as it was; the agent can still read the PDF itself.
 */
export function drawAttachedPages(
  folder: string,
  attached: ReadonlyArray<{ readonly file: File; readonly reference: string }>,
): void {
  if (readStudioImport()?.writeDrawingPages === undefined) return;
  void (async () => {
    for (const { file, reference } of attached) {
      if (!/\.pdf$/i.test(reference)) continue;
      const name = file.name;
      const toastId = toastManager.add({ type: "loading", title: `Reading ${name}`, timeout: 0 });
      try {
        const index = await keepDrawingPages(
          folder,
          reference,
          await file.arrayBuffer(),
          (page, count) =>
            toastManager.update(toastId, {
              type: "loading",
              title: `Reading ${name}`,
              description: `Sheet ${page} of ${count}`,
            }),
        );
        const sheets = index?.pageCount ?? 0;
        const scanned = index?.pages.filter((page) => !page.words).length ?? 0;
        toastManager.update(toastId, {
          type: "success",
          title: `${name}: ${sheets} ${sheets === 1 ? "sheet" : "sheets"} ready to read`,
          description:
            scanned === 0
              ? "Every callout's words came with it."
              : scanned === sheets
                ? "Scanned: the agent reads the pictures."
                : `${scanned} scanned, read from their pictures.`,
          timeout: 6_000,
        });
      } catch (error) {
        toastManager.update(toastId, {
          type: "error",
          title: `Could not read the sheets of ${name}`,
          description:
            error instanceof Error ? error.message : "The PDF is in References as it was.",
          timeout: 8_000,
        });
      }
    }
  })();
}
