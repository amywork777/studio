/**
 * A vector drawing's words, as the agent reads them beside the page's picture: each callout's text
 * and where it sits on the sheet (0 to 1 from the top left, the box a drawing check's rows use).
 * pdf.js gives text in runs ("4X M6 TAPS", ".201", "[5.10]"); a callout is the runs that sit
 * together, so they are grouped by line and then by block.
 */

/** A run of text on the page, in the page's pixels at scale 1, the y axis down. */
export interface TextRun {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Degrees counter-clockwise; a section's labels may run up the sheet. */
  readonly angle: number;
}

export interface Callout {
  /** Its lines, top first, joined by a newline. */
  readonly text: string;
  readonly box: readonly [number, number, number, number];
  readonly angle?: number;
}

/**
 * A run from pdf.js: its text matrix already in viewport space (`Util.transform(viewport.transform,
 * item.transform)`), and its advance width at scale 1.
 */
export function runFromMatrix(
  text: string,
  matrix: readonly [number, number, number, number, number, number],
  width: number,
): TextRun {
  const [a, b, c, d, e, f] = matrix;
  const angle = Math.round((Math.atan2(-b, a) * 180) / Math.PI);
  const along = Math.hypot(a, b) === 0 ? [1, 0] : [a / Math.hypot(a, b), b / Math.hypot(a, b)];
  // The run's corners: the baseline start, along the baseline by its width, and up by its height.
  const xs = [e, e + along[0]! * width, e + c, e + along[0]! * width + c];
  const ys = [f, f + along[1]! * width, f + d, f + along[1]! * width + d];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    text,
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    angle: angle || 0,
  };
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const boxOf = (run: TextRun): Box => ({
  x0: run.x,
  y0: run.y,
  x1: run.x + run.width,
  y1: run.y + run.height,
});

const union = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

/** The gap between two boxes along each axis; negative where they overlap. */
const gaps = (a: Box, b: Box) => ({
  x: Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1),
  y: Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1),
});

interface Line {
  readonly runs: TextRun[];
  box: Box;
  readonly size: number;
  readonly angle: number;
}

/** Runs on one baseline, read left to right, with at most a gap of 0.8 letters between them. */
function linesOf(runs: ReadonlyArray<TextRun>): Line[] {
  const lines: Line[] = [];
  const sorted = runs.toSorted((a, b) => a.angle - b.angle || a.y - b.y || a.x - b.x);
  for (const run of sorted) {
    const box = boxOf(run);
    const size = run.angle === 0 ? run.height : Math.min(run.width, run.height) || run.height;
    const line = lines.find(
      (candidate) =>
        candidate.angle === run.angle &&
        run.angle === 0 &&
        Math.abs(candidate.box.y1 - box.y1) < 0.35 * size &&
        gaps(candidate.box, box).x < 0.8 * size,
    );
    if (line === undefined) {
      lines.push({ runs: [run], box, size, angle: run.angle });
    } else {
      line.runs.push(run);
      line.box = union(line.box, box);
    }
  }
  return lines;
}

/** Lines stacked as one callout: no more than about a line apart, and side by side. */
function blocksOf(lines: ReadonlyArray<Line>): Line[][] {
  const parent = lines.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) index = parent[index] = parent[parent[index]!]!;
    return index;
  };
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const a = lines[i]!;
      const b = lines[j]!;
      if (a.angle !== b.angle) continue;
      const size = Math.max(a.size, b.size);
      const gap = gaps(a.box, b.box);
      if (gap.y < 0.6 * size && gap.x < 0.5 * size) parent[find(i)] = find(j);
    }
  }
  const blocks = new Map<number, Line[]>();
  lines.forEach((line, index) => {
    const root = find(index);
    blocks.set(root, [...(blocks.get(root) ?? []), line]);
  });
  return [...blocks.values()];
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** A page's callouts, top to bottom then left to right, boxes as fractions of the page. */
export function calloutsOf(
  runs: ReadonlyArray<TextRun>,
  page: { readonly width: number; readonly height: number },
): Callout[] {
  const words = runs.filter((run) => run.text.trim() !== "");
  return blocksOf(linesOf(words))
    .map((block) => {
      const lines = block.toSorted((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
      const box = lines.map((line) => line.box).reduce(union);
      const text = lines
        .map((line) =>
          line.runs
            .toSorted((a, b) => a.x - b.x)
            .map((run) => run.text.trim())
            .join(" "),
        )
        .join("\n");
      const angle = lines[0]!.angle;
      return {
        text,
        box: [
          round(box.x0 / page.width),
          round(box.y0 / page.height),
          round((box.x1 - box.x0) / page.width),
          round((box.y1 - box.y0) / page.height),
        ] as const,
        ...(angle === 0 ? {} : { angle }),
      };
    })
    .toSorted((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
}

/** A page's picture in its pages folder: `page-01.png`, numbered to the document's length. */
export const pagePictureName = (page: number, pageCount: number) =>
  `page-${String(page).padStart(Math.max(2, String(pageCount).length), "0")}.png`;

/** The folder a PDF's pages go in, beside it: `brief/references/FL-100-pages` (not `.pages`, a Pages document on a Mac). */
export const pagesFolderOf = (pdfPath: string) => `${pdfPath.replace(/\.pdf$/i, "")}-pages`;

/**
 * The scale a page is drawn at: about 200 dots an inch, so a .06 in callout is a dozen pixels tall,
 * the longer side at most 5000 pixels (a 36 in sheet comes out near 140 an inch).
 */
export function pictureScale(widthPt: number, heightPt: number): number {
  const scale = 200 / 72;
  const longest = Math.max(widthPt, heightPt) * scale;
  return longest <= 5000 ? scale : 5000 / Math.max(widthPt, heightPt);
}
