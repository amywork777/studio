/**
 * The canvas's side of a design-options run: the message that asks the agent for the options, and
 * the file it writes as each one is built (`canvas/options.json`), which the canvas reads to place
 * a card per option. Every number on a card comes from that file or from the option's own mesh.
 */

/** Where the agent lists the options it has built, relative to the project's folder. */
export const OPTIONS_FILE = "canvas/options.json";

/** One design option the agent built. */
export interface DesignOption {
  /** Its letter, "a" to "z", which names its script and mesh. */
  readonly key: string;
  readonly name: string;
  /** One plain sentence on how it differs. */
  readonly idea: string;
  /** Its part script, relative to the project's folder. */
  readonly script: string;
  /** Its document id, which opens it in the workspace; null when the agent did not say. */
  readonly model: string | null;
  /** Its mesh, relative to the project's folder. */
  readonly glb: string;
  readonly material: string | null;
  /** Its mass as `cad model inspect` measured it; null when it was not measured. */
  readonly massGrams: number | null;
  /** The option it was made from ("More like this"), or null for a first set. */
  readonly from: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const RELATIVE = /^(?![\\/])(?![A-Za-z]:)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$)).+$/;

/**
 * The options in the agent's file, in its order: one without a letter, a script or a mesh inside
 * the project is left out, and a second with the same letter too. Null when the file is not JSON
 * (the agent may be writing it), so the canvas keeps what it last read.
 */
export function readDesignOptions(contents: string): DesignOption[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }
  const list = isRecord(parsed) && Array.isArray(parsed.options) ? parsed.options : [];
  const seen = new Set<string>();
  return list.flatMap((entry): DesignOption[] => {
    if (!isRecord(entry)) return [];
    const key = text(entry.key)?.toLowerCase() ?? null;
    const script = text(entry.script);
    const glb = text(entry.glb);
    if (key === null || !/^[a-z]$/.test(key) || seen.has(key)) return [];
    if (script === null || glb === null || !RELATIVE.test(script) || !RELATIVE.test(glb)) return [];
    seen.add(key);
    const mass = entry.mass_g;
    const from = text(entry.from)?.toLowerCase() ?? null;
    return [
      {
        key,
        name: text(entry.name) ?? `Option ${key.toUpperCase()}`,
        idea: text(entry.idea) ?? "",
        script: script.replaceAll("\\", "/"),
        model: text(entry.model),
        glb: glb.replaceAll("\\", "/"),
        material: text(entry.material),
        massGrams: typeof mass === "number" && Number.isFinite(mass) && mass > 0 ? mass : null,
        from: from !== null && /^[a-z]$/.test(from) && from !== key ? from : null,
      },
    ];
  });
}

/** How many options a set asks for. */
export const OPTIONS_PER_SET = 4;

/** The letters the next set takes: the first four free after those already used. */
export function nextKeys(taken: ReadonlyArray<string>): string[] {
  const used = new Set(taken);
  return "abcdefghijklmnopqrstuvwxyz"
    .split("")
    .filter((key) => !used.has(key))
    .slice(0, OPTIONS_PER_SET);
}

const entryLine = (key: string, from: string | null) =>
  `{"key": "${key}", "name": "<2 to 4 words>", "idea": "<one plain sentence on how it differs>", ` +
  `"script": "parts/option_${key}.py", "model": "<its document id>", "glb": "canvas/option_${key}.glb", ` +
  `"material": "<its material>", "mass_g": <the mass cad model inspect reports, in grams, or null>` +
  `${from === null ? "" : `, "from": "${from}"`}}`;

/**
 * The message that asks for a set of options: the person's words and pictures first, then how to
 * hand each option to the canvas. `from` is the option a "More like this" set grows from.
 */
export function optionsMessage(input: {
  readonly description: string;
  readonly references: ReadonlyArray<string>;
  readonly keys: ReadonlyArray<string>;
  readonly from: DesignOption | null;
}): string {
  const { keys, from } = input;
  const letters = keys.map((key) => key.toUpperCase()).join(", ");
  const said = input.description.trim();
  const brief =
    from === null
      ? [
          `Make ${keys.length} design options for this part, to compare side by side on the canvas.`,
          ...(said === "" ? [] : ["", said]),
          ...(input.references.length === 0
            ? []
            : [
                "",
                "Read these first; their sizes are the brief:",
                ...input.references.map((path) => `- \`${path}\``),
              ]),
        ]
      : [
          `Make ${keys.length} more design options that grow from option ${from.key.toUpperCase()} ` +
            `(${from.name}, \`${from.script}\`): keep what makes it work and vary the rest.`,
          ...(said === "" ? [] : ["", said]),
        ];
  return [
    ...brief,
    "",
    `Options ${letters}, each:`,
    `- its own part script, \`parts/option_<letter>.py\`, one \`@model\`, meeting the same brief by a`,
    "  really different approach (how it is made, where the material goes, how it fastens)",
    "- a real material set on the part, built and checked as usual",
    '- its mesh exported: `cad model export "$ID" canvas/option_<letter>.glb`',
    '- its mass read with `cad model inspect "$ID"`',
    "",
    `As each one is built, rewrite \`${OPTIONS_FILE}\` with every option so far, keeping the ones`,
    "already there:",
    "```json",
    `{"options": [${keys.map((key) => entryLine(key, from?.key ?? null)).join(", ")}]}`,
    "```",
    "Write only numbers a cad command measured. Do not open the options in the viewer; the canvas",
    "shows them. End with one or two specific questions about the options.",
  ].join("\n");
}

/** A card's place on the board, in board units. */
export interface Place {
  readonly x: number;
  readonly y: number;
}

export const CARD = { width: 300, height: 380, gap: 32 } as const;
export const INPUT = { width: 260 } as const;

/**
 * Where each option sits: a first set in a row right of what it was made from, and each later set
 * in a row under the option it grew from, so a line of exploration reads downwards.
 */
export function optionPlaces(
  options: ReadonlyArray<DesignOption>,
  origin: Place,
): ReadonlyMap<string, Place> {
  const places = new Map<string, Place>();
  const rowsUsed: number[] = [];
  const step = CARD.width + CARD.gap;
  const rowHeight = CARD.height + CARD.gap * 3;
  const sets = new Map<string, DesignOption[]>();
  for (const option of options) {
    const parent = option.from ?? "";
    sets.set(parent, [...(sets.get(parent) ?? []), option]);
  }
  const placeSet = (parent: string, column: number, row: number) => {
    const set = sets.get(parent) ?? [];
    sets.delete(parent);
    while ((rowsUsed[row] ?? -Infinity) > column) row += 1;
    set.forEach((option, index) => {
      places.set(option.key, {
        x: origin.x + (column + index) * step,
        y: origin.y + row * rowHeight,
      });
    });
    rowsUsed[row] = column + set.length;
    for (const [index, option] of set.entries()) {
      if (sets.has(option.key)) placeSet(option.key, column + index, row + 1);
    }
  };
  placeSet("", 0, 0);
  // Sets whose parent is not on the board yet wait at the end of the first free row.
  for (const parent of sets.keys()) placeSet(parent, 0, rowsUsed.length);
  return places;
}
