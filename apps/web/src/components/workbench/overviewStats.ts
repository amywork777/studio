/**
 * What the Overview's stat chips say, read from the project's own files and the runs that wrote
 * them (law 4): a size only where a check measured one, the last export from `exports/`.
 */

const baseName = (path: string) => path.replaceAll("\\", "/").split("/").at(-1) ?? path;
const stemOf = (name: string) =>
  baseName(name)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();

/** The file a check measured a part's size into: a printing check's `<part>….dfam_measure.json`. */
export function measureFileFor(paths: ReadonlyArray<string>, partName: string): string | null {
  const stem = stemOf(partName);
  return (
    paths.find((path) => {
      const name = baseName(path).toLowerCase();
      return name.endsWith(".dfam_measure.json") && name.startsWith(stem);
    }) ?? null
  );
}

/** The size a check measured, millimetres along x, y and z (`mesh.bbox_mm`), or null. */
export function measuredSize(contents: string): readonly [number, number, number] | null {
  try {
    const mesh = (JSON.parse(contents) as { mesh?: { bbox_mm?: unknown } }).mesh;
    const box = mesh?.bbox_mm;
    if (!Array.isArray(box) || box.length !== 3) return null;
    if (!box.every((side) => typeof side === "number" && Number.isFinite(side))) return null;
    return [box[0], box[1], box[2]];
  } catch {
    return null;
  }
}

/** A size as a chip says it, rounded to the millimetre: "105 × 140 × 80 mm". */
export const sizeWords = (size: readonly [number, number, number]) =>
  `${size.map((side) => Math.round(side)).join(" × ")} mm`;

/**
 * When the project was last exported, by its newest zip in `exports/` (`<project> [kind] <date>.zip`,
 * as the Overview's Export names them), or null for none.
 */
export function lastExport(paths: ReadonlyArray<string>): string | null {
  const dates = paths.flatMap((path) => {
    const normal = path.replaceAll("\\", "/");
    if (!/^exports\/[^/]+\.zip$/i.test(normal)) return [];
    const date = /(\d{4}-\d{2}-\d{2})(?: \d+)?\.zip$/i.exec(normal)?.[1];
    return date === undefined ? [] : [date];
  });
  return dates.toSorted().at(-1) ?? null;
}
