/**
 * When Studio's agent reaches for GSL (an implicit model) and when it keeps to build123d, as the cad skill's
 * "Start with the task" says: a refused fillet is offered a smooth blend; a printed part made lighter, a stress
 * result on a light printed part, a heavily blended casting and an organic grip get GSL for that region; every
 * other part stays exact. Sources: the implicits prototype's agent tests (rounds 1-4) and Amy's five triggers for implicits.
 */

/** What the agent should do: build with GSL, offer it and wait, or keep the part exact. */
export type Expected = "gsl" | "offer" | "exact" | "exact-or-offer" | "exact-or-gsl";

export interface BuildChecks {
  /** The script whose part is judged; else the largest part any script builds. */
  readonly part?: string;
  /** Exact cylindrical faces of these radii (mm) the part must keep, at least this many of each. */
  readonly holes?: ReadonlyArray<{ readonly radius: number; readonly count: number }>;
  /** The flat underside at the part's lowest z: at least this share of the seed's, and exact. */
  readonly baseKept?: number;
  /** The part's volume over the seed's, within these bounds. */
  readonly volumeRatio?: readonly [number, number];
  /** A blend of this radius (mm) made: exact round faces of it, or a field's faces where the part is GSL. */
  readonly blend?: number;
}

export interface ImplicitCase {
  readonly id: string;
  readonly source: string;
  readonly prompt: string;
  /** Files copied into the project before the run, from `fixtures/`. */
  readonly seeds: ReadonlyArray<string>;
  readonly expected: Expected;
  readonly checks: BuildChecks;
  /** The brief's process, as a Studio project's setup says it. */
  readonly process?: string;
}

const BRACKET_HOLES = [{ radius: 2.75, count: 2 }] as const;

export const implicitCases: ReadonlyArray<ImplicitCase> = [
  {
    id: "lighten-sls",
    source:
      "Amy's trigger: lightweighting a printed part (round 1 of the agent tests picked pockets)",
    prompt:
      "Make parts/bracket.py about 40% lighter. We're printing it in nylon (SLS). Keep the bolt holes and the mounting faces solid.",
    seeds: ["parts/bracket.py"],
    expected: "gsl",
    checks: {
      part: "parts/bracket.py",
      holes: BRACKET_HOLES,
      baseKept: 0.5,
      volumeRatio: [0.45, 0.75],
    },
  },
  {
    id: "lighten-fdm-arm",
    source: "Amy's trigger: lightweighting a printed part, a new one",
    prompt:
      "A 3D-printed drone arm, 160 mm long, in PETG, as light as you can make it. Keep the four M3 motor-mount holes (16 x 19 mm pattern) and the 10 mm clamp bore at the other end solid.",
    seeds: [],
    expected: "gsl",
    checks: { holes: [{ radius: 1.6, count: 4 }] },
  },
  {
    id: "stress-dmls",
    source:
      "Amy's trigger: FEA high stress; round 3 of the agent tests waited for a study it could not run",
    prompt:
      "The stress check in studies/bracket_stress.md is on parts/bracket.py, printed in AlSi10Mg (DMLS, yield 230 MPa). We need a safety factor of 2 at the inside corner. Fix it without making the bracket any heavier.",
    seeds: ["parts/bracket.py", "studies/bracket_stress.md"],
    expected: "gsl",
    checks: {
      part: "parts/bracket.py",
      holes: BRACKET_HOLES,
      baseKept: 0.5,
      volumeRatio: [0.5, 1.02],
    },
  },
  {
    id: "cast-ribbed",
    source: "Amy's trigger: castings, smooth walls and every fillet in one pass",
    prompt:
      "Design a sand-cast A356 gearbox side cover, 180 x 120 mm, 5 mm walls, 25 mm deep, with a grid of six crossing internal ribs, four bearing bosses joined to the ribs, and every internal wall, rib and boss intersection blended R4 for the casting. Then a machined gasket face and eight M6 tapped holes round the flange.",
    seeds: [],
    expected: "gsl",
    checks: {},
  },
  {
    id: "grip",
    source: "Amy's trigger: organic grips",
    prompt:
      "Design an ergonomic bike handlebar grip for a 22.2 mm bar, 130 mm long, shaped to the palm with finger ridges. Printed in TPU.",
    seeds: [],
    expected: "gsl",
    checks: {},
  },
  {
    id: "named-gyroid",
    source: "The person names the lattice",
    prompt: "Make a gyroid lattice insole, 260 mm long, EU size 42, to print in TPU.",
    seeds: [],
    expected: "gsl",
    checks: {},
  },
  {
    id: "fillet-preapproved",
    source:
      "Amy's trigger: a refused fillet, with the person's yes given up front. The seed's fillet fails where the rib ends 6 mm from the plate's edge, which an exact fillet can work round: either is right",
    prompt:
      "Add 6 mm fillets where the tilted boss and the rib meet the plate in parts/boss_plate.py. If an exact fillet can't be made there, use a smooth blend instead; I'm fine with that.",
    seeds: ["parts/boss_plate.py"],
    expected: "exact-or-gsl",
    checks: { part: "parts/boss_plate.py", blend: 6 },
  },
  {
    id: "fillet-refused",
    source:
      "Amy's trigger: a refused fillet is offered a smooth blend, never applied silently; an exact fillet worked round is right too",
    prompt:
      "Add 6 mm fillets where the tilted boss and the rib meet the plate in parts/boss_plate.py.",
    seeds: ["parts/boss_plate.py"],
    expected: "exact-or-offer",
    checks: { part: "parts/boss_plate.py" },
  },
  {
    id: "lighten-process-unknown",
    source: "Ambiguous: lighter, with no process decided",
    prompt: "Make parts/bracket.py lighter.",
    seeds: ["parts/bracket.py"],
    expected: "exact-or-offer",
    checks: { part: "parts/bracket.py", holes: BRACKET_HOLES },
  },
  {
    id: "lighten-machined",
    source: "Control: lighter, but machined",
    prompt: "Make parts/bracket.py about 30% lighter. It's machined from 6061 plate.",
    seeds: ["parts/bracket.py"],
    expected: "exact",
    checks: {
      part: "parts/bracket.py",
      holes: BRACKET_HOLES,
      baseKept: 0.5,
      volumeRatio: [0.55, 0.85],
    },
    process: "CNC machining",
  },
  {
    id: "smooth-words",
    source: "Trap: 'smooth blend' said of a fillet build123d makes",
    prompt: "Put a smooth 4 mm blend where the boss meets the plate in parts/boss_upright.py.",
    seeds: ["parts/boss_upright.py"],
    expected: "exact",
    checks: { part: "parts/boss_upright.py" },
  },
  {
    id: "cnc-plate",
    source: "Control",
    prompt:
      "A 100 x 60 x 5 mm aluminium mounting plate with four M5 clearance holes 8 mm in from each corner, to be CNC machined.",
    seeds: [],
    expected: "exact",
    checks: { holes: [{ radius: 2.75, count: 4 }] },
  },
  {
    id: "fillet-works",
    source: "Control",
    prompt: "Round all the outside edges of parts/plate.py with 1 mm fillets.",
    seeds: ["parts/plate.py"],
    expected: "exact",
    checks: { part: "parts/plate.py", holes: [{ radius: 2.75, count: 4 }] },
  },
  {
    id: "print-no-weight",
    source: "Control: printed, nothing said of weight",
    prompt: "A phone stand to 3D print in PLA that holds a phone at 65 degrees.",
    seeds: [],
    expected: "exact",
    checks: {},
  },
  {
    id: "sheet-bracket",
    source: "Control",
    prompt:
      "A 2 mm aluminium sheet-metal L bracket, 40 mm wide, legs 50 and 30 mm, two 5.5 mm holes in each leg, 2 mm bend radius.",
    seeds: [],
    expected: "exact",
    checks: { holes: [{ radius: 2.75, count: 4 }] },
  },
  {
    id: "stress-machined",
    source: "Control: a stress result on a machined part",
    prompt:
      "The stress check in studies/bracket_stress.md is on parts/bracket.py, machined from 6061-T6 (yield 276 MPa). We need a safety factor of 2 at the inside corner. Fix it.",
    seeds: ["parts/bracket.py", "studies/bracket_stress.md"],
    expected: "exact",
    checks: { part: "parts/bracket.py", holes: BRACKET_HOLES, baseKept: 0.5 },
    process: "CNC machining",
  },
  {
    id: "molded-enclosure",
    source: "Control: a molding whose fillets build123d makes",
    prompt:
      "An injection-molded ABS enclosure base, 120 x 80 x 40 mm, 2 mm walls, 1 degree draft, R1 fillets inside and out, and four screw bosses for M3 self-tappers.",
    seeds: [],
    expected: "exact",
    checks: {},
  },
];
