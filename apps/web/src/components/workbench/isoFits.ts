/**
 * ISO 286-1:2010's limits for a tolerance class or a fit at a nominal size up to 500 mm: its standard
 * tolerance grades (Table 1) and fundamental deviations (Tables 2 and 3), so a class's limits are
 * the standard's, as ISO 286-2 tabulates them. The `iso-fits` job skill carries them, worked out for
 * every class here (`isoFitsTable`), for the agent to read off and write into a part's script.
 */

/** The bounds of each range of nominal sizes, mm: over the one before, up to and including this. */
const MAIN_RANGES = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500] as const;
/** The ranges the fundamental deviations of c, r, s, t and u (and their holes) split further. */
const SUB_RANGES = [
  3, 6, 10, 14, 18, 24, 30, 40, 50, 65, 80, 100, 120, 140, 160, 180, 200, 225, 250, 280, 315, 355,
  400, 450, 500,
] as const;

/** Table 1, µm, by grade then main range. */
const IT: Readonly<Record<number, ReadonlyArray<number>>> = {
  4: [3, 4, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20],
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
  12: [100, 120, 150, 180, 210, 250, 300, 350, 400, 460, 520, 570, 630],
  13: [140, 180, 220, 270, 330, 390, 460, 540, 630, 720, 810, 890, 970],
};
const GRADES = Object.keys(IT).map(Number);

/** A main range's value at each of the sub-ranges it holds. */
const byMain = (values: ReadonlyArray<number>) =>
  SUB_RANGES.map((bound) => values[MAIN_RANGES.findIndex((main) => bound <= main)]!);

/** Table 2, a shaft's upper deviation es (a to h), µm, by sub-range. */
const UPPER: Readonly<Record<string, ReadonlyArray<number>>> = {
  c: [
    -60, -70, -80, -95, -95, -110, -110, -120, -130, -140, -150, -170, -180, -200, -210, -230, -240,
    -260, -280, -300, -330, -360, -400, -440, -480,
  ],
  d: byMain([-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230]),
  e: byMain([-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135]),
  f: byMain([-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68]),
  g: byMain([-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20]),
  h: byMain(MAIN_RANGES.map(() => 0)),
};

/** Table 2, a shaft's lower deviation ei (k to u), µm, by sub-range; null where it has none. */
const LOWER: Readonly<Record<string, ReadonlyArray<number | null>>> = {
  /** k's for grades 4 to 7; every other grade's is 0. */
  k: byMain([0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5]),
  m: byMain([2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23]),
  n: byMain([4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40]),
  p: byMain([6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68]),
  r: [
    10, 15, 19, 23, 23, 28, 28, 34, 34, 41, 43, 51, 54, 63, 65, 68, 77, 80, 84, 94, 98, 108, 114,
    126, 132,
  ],
  s: [
    14, 19, 23, 28, 28, 35, 35, 43, 43, 53, 59, 71, 79, 92, 100, 108, 122, 130, 140, 158, 170, 190,
    208, 232, 252,
  ],
  t: [
    null,
    null,
    null,
    null,
    null,
    null,
    41,
    48,
    54,
    66,
    75,
    91,
    104,
    122,
    134,
    146,
    166,
    180,
    196,
    218,
    240,
    268,
    294,
    330,
    360,
  ],
  u: [
    18, 23, 28, 33, 33, 41, 48, 60, 70, 87, 102, 124, 144, 170, 190, 210, 236, 258, 284, 315, 350,
    390, 435, 490, 540,
  ],
};

/** The fundamental deviations Studio holds: a shaft's in lower case, a hole's the same in capitals. */
const ISO_FIT_LETTERS = [
  ...Object.keys(UPPER),
  "js",
  ...Object.keys(LOWER),
] as ReadonlyArray<string>;

/** A tolerance class's limits, mm, as deviations from the nominal size. */
export interface ClassLimits {
  /** `H7`, `g6`. */
  readonly name: string;
  readonly feature: "hole" | "shaft";
  /** The size range the limits hold for, mm: over `over`, up to and including `upTo`. */
  readonly over: number;
  readonly upTo: number;
  readonly upper: number;
  readonly lower: number;
}

const CLASS = /^([A-Z]{1,2}|[a-z]{1,2})(\d{1,2})$/;

const microns = (value: number) => Math.round(value * 10) / 10;

/** The tolerance class `name` (`H7`, `g6`) at `size` mm, or why it has none. */
export function toleranceClass(name: string, size: number): ClassLimits | string {
  const match = CLASS.exec(name.trim());
  if (match === null) return `${name} is not an ISO 286 tolerance class (H7, g6).`;
  const [, letters, gradeText] = match as unknown as [string, string, string];
  const hole = letters === letters.toUpperCase();
  const letter = letters.toLowerCase();
  const grade = Number(gradeText);
  if (!ISO_FIT_LETTERS.includes(letter)) {
    return `Studio's table has no ${letters} ${hole ? "hole" : "shaft"} (it has ${ISO_FIT_LETTERS.join(", ")}).`;
  }
  if (!GRADES.includes(grade)) {
    return `Studio's table has grades IT${GRADES[0]} to IT${GRADES.at(-1)}, not IT${grade}.`;
  }
  if (!(size > 0 && size <= 500)) return `ISO 286 limits here are for 0 to 500 mm, not ${size} mm.`;
  const sub = SUB_RANGES.findIndex((bound) => size <= bound);
  const main = MAIN_RANGES.findIndex((bound) => size <= bound);
  const tolerance = IT[grade]![main]!;
  const range = { over: sub === 0 ? 0 : SUB_RANGES[sub - 1]!, upTo: SUB_RANGES[sub]! };

  // A shaft's deviations, µm; a hole's below are these turned over (ISO 286-1, 5.3.2).
  let es: number;
  let ei: number;
  if (letter === "js") {
    es = tolerance / 2;
    ei = -tolerance / 2;
  } else if (letter in UPPER) {
    es = UPPER[letter]![sub]!;
    ei = es - tolerance;
  } else {
    const base = LOWER[letter]![sub];
    if (base === null || base === undefined) {
      return `ISO 286 gives ${letters} no deviation up to ${range.upTo} mm.`;
    }
    ei = letter === "k" && (grade < 4 || grade > 7) ? 0 : base;
    es = ei + tolerance;
  }
  if (!hole) {
    return {
      name: `${letters}${grade}`,
      feature: "shaft",
      ...range,
      upper: es / 1000,
      lower: ei / 1000,
    };
  }

  let ES: number;
  if (letter === "js" || letter in UPPER) {
    ES = -ei;
  } else {
    // K to U: ES is -ei, raised by Δ (IT n less IT n-1) where Table 3 says (ISO 286-1, 5.3.2.2).
    const delta = grade >= 5 ? tolerance - IT[grade - 1]![main]! : null;
    const below8 = grade <= 8;
    if (letter === "k" || letter === "m" || letter === "n") {
      if (grade > 8) {
        ES = letter === "m" ? -LOWER.m![sub]! : size <= 3 && letter === "n" ? -4 : 0;
      } else if (delta === null) {
        return `Studio's table has ${letters} holes from IT5.`;
      } else {
        const base = LOWER[letter]![sub]!;
        ES = size <= 3 ? -base : -base + delta;
        // Table 3's one exception: M6 over 250 up to 315 mm is -9, not -11.
        if (letter === "m" && grade === 6 && MAIN_RANGES[main] === 315) ES = -9;
      }
    } else if (below8 && grade <= 7) {
      if (delta === null) return `Studio's table has ${letters} holes from IT5.`;
      ES = -LOWER[letter]![sub]! + (size <= 3 ? 0 : delta);
    } else {
      ES = -LOWER[letter]![sub]!;
    }
  }
  const EI = ES - tolerance;
  return {
    name: `${letters}${grade}`,
    feature: "hole",
    ...range,
    upper: microns(ES) / 1000,
    lower: microns(EI) / 1000,
  };
}

/** How a hole and shaft go together: by the clearance at the tightest and the loosest. */
export type FitKind = "clearance" | "transition" | "interference";

export interface FitLimits {
  readonly fit: string;
  readonly size: number;
  readonly hole: ClassLimits;
  readonly shaft: ClassLimits;
  /** Hole minus shaft, mm, at the tightest (MMC) and the loosest (LMC); negative is interference. */
  readonly tightest: number;
  readonly loosest: number;
  readonly kind: FitKind;
}

const round = (mm: number) => Math.round(mm * 10000) / 10000;

/** A fit (`H7/g6`) at `size` mm: its hole's and shaft's limits and how they go together. */
export function isoFit(fit: string, size: number): FitLimits | string {
  const [holeName, shaftName, ...rest] = fit.replace(/\s/g, "").split("/");
  if (holeName === undefined || shaftName === undefined || rest.length > 0) {
    return `${fit} is not a fit: a hole's class over a shaft's (H7/g6).`;
  }
  const hole = toleranceClass(holeName, size);
  if (typeof hole === "string") return hole;
  if (hole.feature !== "hole")
    return `${holeName} is a shaft's class; a fit's hole is in capitals.`;
  const shaft = toleranceClass(shaftName, size);
  if (typeof shaft === "string") return shaft;
  if (shaft.feature !== "shaft")
    return `${shaftName} is a hole's class; a fit's shaft is in lower case.`;
  const tightest = round(hole.lower - shaft.upper);
  const loosest = round(hole.upper - shaft.lower);
  const kind: FitKind = tightest >= 0 ? "clearance" : loosest <= 0 ? "interference" : "transition";
  return { fit: `${hole.name}/${shaft.name}`, size, hole, shaft, tightest, loosest, kind };
}

/** ISO 286-1 Annex B's preferred hole-basis fits, by what each is for, loosest first. */
export const ISO_FIT_PRESETS: ReadonlyArray<{
  readonly fit: string;
  readonly name: string;
  readonly use: string;
}> = [
  {
    fit: "H11/c11",
    name: "Loose running",
    use: "Wide clearance for rough work or parts that get hot or dirty.",
  },
  {
    fit: "H9/d9",
    name: "Free running",
    use: "Large temperature swings, high speeds or heavy journal pressures.",
  },
  {
    fit: "H8/f7",
    name: "Close running",
    use: "Accurate running at moderate speed and journal pressure.",
  },
  {
    fit: "H7/g6",
    name: "Sliding",
    use: "Moves and turns freely and locates accurately: a guide pin, a slide.",
  },
  {
    fit: "H7/h6",
    name: "Locational clearance",
    use: "Snug, assembled by hand, located accurately: a spigot, a dowel hole.",
  },
  {
    fit: "H7/k6",
    name: "Locational transition",
    use: "Accurate location, a compromise between clearance and interference.",
  },
  {
    fit: "H7/n6",
    name: "Locational transition, tighter",
    use: "More accurate location where more interference is fine.",
  },
  {
    fit: "H7/p6",
    name: "Locational interference (press)",
    use: "Pressed in, rigid and accurate, taken apart with a press.",
  },
  {
    fit: "H7/s6",
    name: "Medium drive",
    use: "Pressed into steel or shrunk on: the tightest fit for cast iron.",
  },
  {
    fit: "H7/u6",
    name: "Force",
    use: "Shrunk on or pressed hard where the parts must carry load by friction.",
  },
];

/** Every class Studio holds at every size range where it has limits, for the job skill's table. */
export function isoFitsTable(): Record<
  string,
  ReadonlyArray<readonly [number, number, number, number]>
> {
  const table: Record<string, Array<readonly [number, number, number, number]>> = {};
  for (const letter of ISO_FIT_LETTERS) {
    for (const letters of [letter.toUpperCase(), letter]) {
      for (const grade of GRADES) {
        const rows: Array<readonly [number, number, number, number]> = [];
        for (const bound of SUB_RANGES) {
          const limits = toleranceClass(`${letters}${grade}`, bound);
          if (typeof limits === "string") continue;
          const last = rows.at(-1);
          if (last !== undefined && last[2] === limits.upper && last[3] === limits.lower) {
            rows[rows.length - 1] = [last[0], limits.upTo, last[2], last[3]];
          } else {
            rows.push([limits.over, limits.upTo, limits.upper, limits.lower]);
          }
        }
        if (rows.length > 0) table[`${letters}${grade}`] = rows;
      }
    }
  }
  return table;
}
