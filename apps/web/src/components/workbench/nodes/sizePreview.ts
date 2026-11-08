/**
 * What one size does to a part, from edit mode's own previews (text-to-cad's tracer, through
 * Studio's CAD service): the part as edit mode reads it (`/edit/state`), the features a size drives
 * (its rows), and what a size typed over adds to the part and takes away (`preview_sizes`), built
 * in memory and never written. The part itself is drawn from Draft Analysis' triangles, the one
 * read of the whole body the service gives. Plain functions; the hook is in `useSizePreview`.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const numbers = (value: unknown): ReadonlyArray<number> =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];

/** One size of a feature, as edit mode lists it: its number and the numbers in the source behind it. */
export interface EditInput {
  readonly value: number;
  readonly formula: string;
  /** The source numbers it is made of, by id (`file:line:column`). */
  readonly leaves: ReadonlyArray<string>;
  readonly length: boolean;
}

export interface EditRow {
  readonly key: string;
  readonly inputs: ReadonlyArray<EditInput>;
}

export interface EditState {
  readonly rows: ReadonlyArray<EditRow>;
  readonly units: string | null;
  /** An assembly, whose features are its parts' own. */
  readonly assembly: boolean;
}

export function readEditState(reply: unknown): EditState | null {
  if (!isRecord(reply) || reply.ok !== true || !Array.isArray(reply.rows)) return null;
  const rows = reply.rows.flatMap((row): EditRow[] => {
    if (!isRecord(row) || typeof row.key !== "string" || !Array.isArray(row.inputs)) return [];
    const inputs = row.inputs.flatMap((input): EditInput[] =>
      isRecord(input) && typeof input.value === "number"
        ? [
            {
              value: input.value,
              formula: typeof input.formula === "string" ? input.formula : "",
              leaves: Array.isArray(input.leaves)
                ? input.leaves.filter((leaf): leaf is string => typeof leaf === "string")
                : [],
              length: input.length !== false,
            },
          ]
        : [],
    );
    return [{ key: row.key, inputs }];
  });
  return {
    rows,
    units: typeof reply.units === "string" ? reply.units : null,
    assembly: Array.isArray(reply.components) && reply.components.length > 0,
  };
}

/** Where a size feeds a feature: the row, the input's place in it, and the input. */
export interface SizeUse {
  readonly row: string;
  readonly index: number;
  readonly input: EditInput;
}

/**
 * Every feature size of the part made from the size written on `line` of `file` (from the
 * project's folder), whichever file the part's script is: a source number's id is
 * `file:line:column`.
 */
export function sizeUses(state: EditState, file: string, line: number): ReadonlyArray<SizeUse> {
  const at = `${file}:${line}:`;
  return state.rows.flatMap((row) =>
    row.inputs.flatMap((input, index) =>
      input.leaves.some((leaf) => leaf.startsWith(at)) ? [{ row: row.key, index, input }] : [],
    ),
  );
}

/**
 * A preview's ask that makes the size `name` (now `now`) read `typed`: one feature size typed over,
 * in the units edit mode reads it in. Only a feature size that is the size alone, or it times or
 * over plain numbers (`MOTOR_BOLT_PATTERN/2`), scales with it; null where none does (a sum, or two
 * sizes), as the size is then not one edit mode can type.
 */
export function typedPreview(
  uses: ReadonlyArray<SizeUse>,
  name: string,
  now: number,
  typed: number,
  units: string | null,
): {
  readonly row: string;
  readonly values: ReadonlyArray<{ index: number; text: string }>;
} | null {
  if (now === 0 || !Number.isFinite(typed)) return null;
  const scales = new RegExp(`^-?(?:[0-9.]+\\*)*${name}(?:[*/][0-9.]+)*$`);
  const use = uses.find((each) => scales.test(each.input.formula.replace(/\s+/g, "")));
  if (use === undefined) return null;
  const mm = (use.input.value * typed) / now;
  const shown = units === "in" && use.input.length ? mm / 25.4 : mm;
  return { row: use.row, values: [{ index: use.index, text: String(Number(shown.toFixed(6))) }] };
}

/** A solid as a preview draws it: three numbers a corner, three corners a triangle, in millimetres. */
export interface Drawn {
  readonly positions: ReadonlyArray<number>;
  readonly triangles: ReadonlyArray<number>;
}

function readDrawn(value: unknown): Drawn | null {
  if (!isRecord(value)) return null;
  const positions = numbers(value.positions);
  const triangles = numbers(value.triangles);
  return positions.length === 0 || triangles.length === 0 ? null : { positions, triangles };
}

/** What a preview adds to the part and takes away, or why it could not be made. */
export interface Change {
  readonly added: Drawn | null;
  readonly removed: Drawn | null;
  readonly error: string | null;
}

export function readChange(reply: unknown): Change | null {
  if (!isRecord(reply) || reply.ok !== true || !isRecord(reply.preview)) return null;
  const preview = reply.preview;
  return {
    added: readDrawn(preview.added),
    removed: readDrawn(preview.removed),
    error: typeof preview.error === "string" && preview.error !== "" ? preview.error : null,
  };
}

/** The whole part's triangles, unshared corners, from Draft Analysis' reply. */
export function readBody(reply: unknown): Drawn | null {
  if (!isRecord(reply) || reply.ok !== true || !isRecord(reply.draft_check)) return null;
  const positions = numbers(reply.draft_check.positions);
  if (positions.length < 9) return null;
  return { positions, triangles: Array.from({ length: positions.length / 3 }, (_, at) => at) };
}
