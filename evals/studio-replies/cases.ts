/** How a Studio agent ends its reply to an engineer (law 5: build first, then ask). */
export type StudioReplyCase = {
  readonly id: string;
  /** `bad` reproduces a real reply, `control` is ordinary work that must not change. */
  readonly kind: "bad" | "control";
  readonly source: string;
  readonly prompt: string;
  /** Files in the project folder, by path. */
  readonly files?: Readonly<Record<string, string>>;
  /** Case-insensitive regexes the reply must match, each. */
  readonly mustMatch?: ReadonlyArray<string>;
  /** Case-insensitive regexes the reply must not match. */
  readonly mustNotMatch?: ReadonlyArray<string>;
  /**
   * The files the agent wrote or changed whose path matches `path`: each `mustMatch` in one of them
   * (so at least one is written) and no `mustNotMatch` in any (a CAM job's limits, an assembly's imports).
   */
  readonly writes?: {
    readonly path: string;
    readonly mustMatch?: ReadonlyArray<string>;
    readonly mustNotMatch?: ReadonlyArray<string>;
  };
  /** Studio's copy of text-to-cad's skills, as the app gives them to the agent. */
  readonly skills?: boolean;
  /**
   * Commands the agent may run, each answered from these fixtures by the first whose `args` regex
   * matches its arguments: a stand-in for Studio's `cad`, so no engine or FreeCAD starts.
   */
  readonly commands?: Readonly<Record<string, ReadonlyArray<CommandFixture>>>;
  /** Case-insensitive regexes each matched by a command line the agent ran (`cad step plan …`). */
  readonly mustRun?: ReadonlyArray<string>;
  /** Case-insensitive regexes no command line the agent ran may match. */
  readonly mustNotRun?: ReadonlyArray<string>;
  /** Case-insensitive regexes, each capturing one quantity's number: the reply gives it one value. */
  readonly sameValue?: ReadonlyArray<string>;
  /**
   * What the agent may not write before it runs a command matching `run` (in any text of the turn,
   * the reply too when none ran): a plan's controller before the plan.
   */
  readonly beforeRun?: { readonly run: string; readonly mustNotMatch: ReadonlyArray<string> };
};

/** What the agent did in its turn, in order: a text it wrote or a command it ran. */
export type TurnStep = { readonly text: string } | { readonly command: string };

export type CommandFixture = {
  readonly args: string;
  readonly stdout: string;
  /** Written to stderr, and the exit code, for a command that fails. */
  readonly stderr?: string;
  readonly code?: number;
  /** Answers only this many calls; the next fixture that matches answers the rest. */
  readonly times?: number;
  /** Files written into the folder the call's `--out` names, as a plan writes its results. */
  readonly writes?: Readonly<Record<string, string>>;
};

const PLATE_STEP = [
  "ISO-10303-21;",
  "HEADER;",
  "FILE_DESCRIPTION(('Mounting plate, 100 x 60 x 8 mm'),'2;1');",
  "FILE_NAME('plate.step','2026-11-20',(''),(''),'','','');",
  "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
  "ENDSEC;",
  "DATA;",
  "#1=APPLICATION_CONTEXT('automotive design');",
  "#2=PRODUCT('plate','plate','',(#3));",
  "#3=PRODUCT_CONTEXT('',#1,'mechanical');",
  "#10=CARTESIAN_POINT('',(-50.,-30.,0.));",
  "#11=CARTESIAN_POINT('',(50.,30.,8.));",
  "/* 4 x CYLINDRICAL_SURFACE r 3.3 at (+-40, +-20); pocket 40 x 20 x 3 */",
  "ENDSEC;",
  "END-ISO-10303-21;",
  "",
].join("\n");

const PLATE_JOB = JSON.stringify(
  {
    machine: { post: "grbl", max_rpm: 10000 },
    material: "aluminum-6061",
    stock: { margin_mm: [3, 3, 1] },
    tools: [
      {
        id: "T1",
        type: "flat",
        number: 1,
        diameter_mm: 6,
        flutes: 3,
        flute_length_mm: 20,
        stickout_mm: 30,
        shank_diameter_mm: 6,
      },
      {
        id: "T2",
        type: "drill",
        number: 2,
        diameter_mm: 6.6,
        flute_length_mm: 40,
        stickout_mm: 55,
        point_angle: 118,
      },
    ],
    setups: [
      {
        id: "top",
        orientation: "+Z",
        origin: "stock-top-center",
        operations: [
          { op: "face", tool: "T1" },
          { op: "pocket", tool: "T1", faces: ["plate/face 12"] },
          {
            op: "drill",
            tool: "T2",
            faces: ["plate/face 7", "plate/face 8", "plate/face 9", "plate/face 10"],
          },
          { op: "profile", tool: "T1", side: "outside", through_mm: 0.5 },
        ],
      },
    ],
  },
  null,
  2,
);
// A plan's files, sized and shaped like 0.11.17's: one GRBL file a tool, each opening with its two comment lines.
const posted = (tool: string, header: string, moves: ReadonlyArray<string>) =>
  [
    `(plate, setup top, ${tool}: FreeCAD 1.1.4, grbl post, cad step plan 0.11.17)`,
    "(Not proven on a machine: air-cut it or run it single block first.)",
    "G21 G90 G17 G54",
    header,
    ...moves,
    "M5",
    "G0 Z15",
    "M30",
    "",
  ].join("\n");
const ring = (z: number, half: [number, number]) =>
  [-1, 1, 1, -1, -1].map((sx, i) => {
    const sy = [-1, -1, 1, 1, -1][i]!;
    return `G1 X${(sx * half[0]).toFixed(3)} Y${(sy * half[1]).toFixed(3)} Z${z.toFixed(3)} F1200`;
  });
const PLAN_RESULTS = {
  "result.json": JSON.stringify(
    {
      ok: true,
      headline: "Ready to cut · 9 min · 2 tools",
      freecad: "1.1.4",
      post: "grbl",
      measurements: {
        stock_mm: [106, 66, 9],
        setups: [
          {
            id: "top",
            work_zero: "stock-top-center, G54",
            operations: [
              { op: "face", tool: "T1", rpm: 10000, feed_mm_min: 1200, minutes: 1.2 },
              { op: "pocket", tool: "T1", rpm: 10000, feed_mm_min: 1200, minutes: 2.9 },
              { op: "profile", tool: "T1", rpm: 10000, feed_mm_min: 1200, minutes: 4.1 },
              { op: "drill", tool: "T2", rpm: 2400, feed_mm_min: 190, minutes: 0.8 },
            ],
          },
        ],
      },
      assumed: ["machine.travel_mm not given: travel not checked"],
      errors: [],
      warnings: [],
    },
    null,
    2,
  ),
  "result.glb": `glTF\u0002\u0000\u0000\u0000${"\u0000".repeat(48_000)}`,
  "plate.top.1-T1.nc": posted(
    "T1",
    "T1\nS10000 M3\nG0 X-56 Y-36 Z5",
    Array.from({ length: 60 }, (_, layer) =>
      ring(-0.5 * (layer % 20), [53 - (layer % 5), 33 - (layer % 5)]),
    ).flat(),
  ),
  "plate.top.2-T2.nc": posted(
    "T2",
    "T2\nS2400 M3",
    [
      [-40, -20],
      [40, -20],
      [40, 20],
      [-40, 20],
    ].flatMap(([x, y]) => [`G0 X${x} Y${y} Z3`, "G83 Z-9.5 R1 Q2 F190", "G80"]),
  ),
};

// What `cad` answers, in the words its 0.11.17 commands print them.
const VIEWER_LINK =
  "http://127.0.0.1:4178/9c3e1f2a-5b7d-4e6f-8a1b-2c3d4e5f6a7b?token=1767225600.k3Jq9xW2pLm8";
const CAD: ReadonlyArray<CommandFixture> = [
  { args: "^--version$", stdout: "cad 0.11.17\n" },
  {
    args: "^viewer\\b",
    stdout:
      JSON.stringify({
        url: VIEWER_LINK.replace(/\/[^/?]+\?/, "/?"),
        documents: [{ path: "CAM/result.glb", url: VIEWER_LINK }],
      }) + "\n",
  },
  {
    args: "\\bplan\\b.*--job",
    writes: PLAN_RESULTS,
    stdout: [
      "Ready to cut · 9 min · 2 tools",
      "top  face     T1 Ø6 flat     10000 rpm   1200 mm/min   1.2 min",
      "top  pocket   T1 Ø6 flat     10000 rpm   1200 mm/min   2.9 min",
      "top  drill    T2 Ø6.6 drill   2400 rpm    190 mm/min   0.8 min",
      "top  profile  T1 Ø6 flat     10000 rpm   1200 mm/min   4.1 min",
      "wrote result.json, result.glb, plate.top.1-T1.nc, plate.top.2-T2.nc",
      "assumed: machine.travel_mm not given: travel not checked",
      "0 errors, 0 warnings",
      "",
    ].join("\n"),
  },
  {
    args: "\\bplan\\b",
    stdout: [
      "parts/plate.step: 1 part, 100 x 60 x 8 mm",
      "plate/face 1   flat top at Z 8, facing +Z, 5199.1 mm²",
      "plate/face 12  flat floor at Z 5, facing +Z (a pocket floor 3 mm down), 800 mm²",
      "hole plate/face 7: Ø6.6 x 8 through along +Z at (-40, -20, 8)",
      "hole plate/face 8: Ø6.6 x 8 through along +Z at (40, -20, 8)",
      "hole plate/face 9: Ø6.6 x 8 through along +Z at (40, 20, 8)",
      "hole plate/face 10: Ø6.6 x 8 through along +Z at (-40, 20, 8)",
      "",
    ].join("\n"),
  },
];
const STUDIO_FREECAD: ReadonlyArray<CommandFixture> = [
  { args: "--check", stdout: "Studio's FreeCAD 1.1.4 is installed.\n" },
];

// `studio-install-freecad` as scripts/studio_freecad.py answers while its install of a few minutes
// runs on its own: each call returns within 90 s, and the fourth says FreeCAD is installed.
const AGAIN =
  "Run `studio-install-freecad --wait` again until it says FreeCAD is installed; no plan has run yet.\n";
const FREECAD_INSTALLING: ReadonlyArray<CommandFixture> = [
  {
    args: "--check",
    times: 1,
    stdout:
      "FreeCAD is not installed for Studio. `studio-install-freecad` installs FreeCAD 1.1.4 (a download of about 650 MB), once the person says yes\n",
    code: 1,
  },
  {
    args: "--check",
    stdout: `FreeCAD is being installed for Studio now. ${AGAIN}`,
    code: 1,
  },
  {
    args: "^(?!.*--wait)",
    times: 1,
    stdout: `Installing FreeCAD 1.1.4 for Studio (a download of about 650 MB, a few minutes).\nStill installing FreeCAD for Studio, at: 190 of 650 MB ${AGAIN}`,
  },
  {
    args: "",
    times: 1,
    stdout: `Still installing FreeCAD for Studio, at: 520 of 650 MB ${AGAIN}`,
  },
  {
    args: "",
    times: 1,
    stdout: `Still installing FreeCAD for Studio, at: Checking FreeCAD's signature with macOS (about a minute). ${AGAIN}`,
  },
  {
    args: "",
    stdout:
      "Installed FreeCAD 1.1.4 for Studio: /home/user/.studio/tools/freecad/FreeCAD.app/Contents/Resources/bin/freecadcmd. Plan now.\n",
  },
];

// What `cad` says building and exporting the flat plate, as 0.11.17 prints it.
const PLATE_ID = "87d93325-bff6-5f2a-b2d8-7c49a1d4e61b";
const built = (script: string, id: string) =>
  [
    `built ${script}::flat_plate cold in 45.83s: bodies 1 run; 11 misses, 0 hits; body 0.26s, names 0.01s, document 0.00s`,
    "  parts 1 · bounds 80 × 50 × 6 mm · joints 0 · sequences 0",
    `  id: ${id}`,
    `  view: http://127.0.0.1:4178/${id}?token=1767225600.k3Jq9xW2pLm8`,
    "",
  ].join("\n");
const CAD_BUILDS: ReadonlyArray<CommandFixture> = [
  { args: "^--version$", stdout: "cad 0.11.17\n" },
  { args: "^server\\b", stdout: "the cad server is running (cad 0.11.17)\n" },
  { args: "^run\\b.*\\bparts/flat_plate\\.py\\b", stdout: built("parts/flat_plate.py", PLATE_ID) },
  { args: "^run\\b.*\\bflat_plate\\.py\\b", stdout: built("flat_plate.py", PLATE_ID) },
  {
    args: "^run\\b",
    stdout: built("parts/flat_plate_plain.py", "0b4d2c1e-9a8f-5e7d-a6b5-c4d3e2f1a0b9"),
  },
  { args: "^model export\\b", stdout: "wrote parts/flat_plate.step (22.3 KB) in 0.01s\n" },
  {
    args: "^model inspect\\b",
    stdout:
      "flat plate  87d93325-bff6-5f2a-b2d8-7c49a1d4e61b\nparts       1 in flat plate\nbounds      80 x 50 x 6 mm, from (0, 0, 0)\nvolume      23,529 mm^3\n",
  },
  { args: "^model snapshot\\b", stdout: "wrote snapshot.png\n" },
];
// This computer's own Python, which has build123d but not Studio's `cad` library (the 0.1.19 retest's Mac).
const MACHINE_PYTHON: ReadonlyArray<CommandFixture> = [
  {
    args: "\\b(?:from|import)\\s+(?:cad|flat_plate)\\b|flat_plate\\.py",
    stdout: "",
    stderr: [
      "Traceback (most recent call last):",
      "ModuleNotFoundError: No module named 'cad'",
      "",
    ].join("\n"),
    code: 1,
  },
  { args: "", stdout: "ok\n" },
];

// A plate bolted through its hole, sized as the 0.1.19 retest's: the models' washer and nut are
// thicker than the standards' nominal ones, so the script's stack leaves 5.4 mm of thread below the nut.
const BOLTED_PLATE: Readonly<Record<string, string>> = {
  "assemblies/plate_assembly.py": [
    '"""The plate with an M8 bolt, washer and nut through its Ø10 mm hole.',
    "",
    "Stack, from the top: the ISO 4017 M8 x 20 bolt's head on the ISO 7089 washer, on the plate (Z 0 to 6),",
    "then the ISO 4032 M8 nut under the plate.",
    '"""',
    "",
    "import sys",
    "from pathlib import Path",
    "",
    "import build123d as bd",
    "from cad import model, step",
    "",
    'sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "parts"))',
    "",
    "from plate import plate  # noqa: E402",
    "",
    "PLATE_TOP = 6",
    "WASHER_THICKNESS = 1.8  # bd_warehouse's ISO 7089 table",
    "NUT_HEIGHT = 6.8  # bd_warehouse's ISO 4032 table",
    "BOLT_LENGTH = 20",
    "",
    "",
    "@model",
    "def plate_assembly():",
    '    washer = step.read("parts/imported/iso7089_m8.step")',
    '    bolt = step.read("parts/imported/iso4017_m8x20.step")',
    '    nut = step.read("parts/imported/iso4032_m8.step")',
    "    bolt_z = PLATE_TOP + WASHER_THICKNESS",
    "    return bd.Compound(",
    "        children=[",
    "            plate().shape,",
    "            bd.Pos(40, 25, PLATE_TOP) * washer,",
    "            bd.Pos(40, 25, bolt_z) * bolt,",
    "            bd.Pos(40, 25, -NUT_HEIGHT) * nut,",
    "        ],",
    "    )",
    "",
  ].join("\n"),
  "parts/plate.py": [
    "from build123d import *",
    "from cad import model",
    "",
    "",
    "@model",
    "def plate():",
    "    with BuildPart() as part:",
    "        Box(80, 50, 6, align=(Align.MIN, Align.MIN, Align.MIN))",
    "        with Locations((40, 25, 6)):",
    "            Hole(radius=5)",
    "    return part",
    "",
  ].join("\n"),
};

export const studioReplyCases: ReadonlyArray<StudioReplyCase> = [
  {
    id: "study-fix-offer",
    kind: "bad",
    source:
      'A Studio thread, 2026-11: after a strength check, the agent ended with "Would you like me to run that change as a study?"',
    prompt: "The bracket study says a safety factor of 1.3. What if the wall went to 3 mm?",
    files: {
      "parts/servo_bracket.py": [
        "from build123d import *",
        "",
        "WALL = 2.0  # mm",
        "WIDTH = 30.0",
        "HEIGHT = 40.0",
        "",
        "with BuildPart() as bracket:",
        "    Box(WIDTH, WALL, HEIGHT)",
        "",
        "result = bracket.part",
        "",
      ].join("\n"),
      "studies/servo_bracket_static/report.md": [
        "# Servo bracket: static strength study",
        "",
        "- Part: parts/servo_bracket.py, 2 mm wall, 6061-T6 (yield 276 MPa)",
        "- Load: 40 N at the horn mount, fixed at the base holes",
        "- Mesh: 41,200 tetrahedra, converged within 3%",
        "- Peak von Mises stress: 210 MPa, at the inside corner of the horn mount",
        "- Safety factor: 1.31",
        "",
      ].join("\n"),
    },
  },
  {
    id: "next-job-offer",
    kind: "bad",
    source:
      'The same thread: a finished job closed with a yes/no offer of the next one ("Would you like me to…?") instead of a choice.',
    prompt:
      "Thanks, the servo bracket now passes its strength check at a safety factor of 3.6. That's this part done for now.",
  },
  {
    id: "cam-asks-first",
    kind: "bad",
    source:
      "Studio 0.1.19 retest, Haiku 5.5: asked for CNC G-code for a plate, the agent asked for flute lengths, stickout, stock, clamping and machine travel before planning anything.",
    prompt:
      "I need CNC G-code to mill this plate, `parts/plate.step`, from 6061 on my GRBL router.",
    files: { "parts/plate.step": PLATE_STEP },
    skills: true,
    commands: { cad: CAD, "studio-install-freecad": STUDIO_FREECAD },
    mustRun: ["\\bplan\\b.*--job"],
  },
  {
    id: "cam-viewer-link",
    kind: "bad",
    source:
      "Studio 0.1.19 retest, Haiku 5.5: after a CAM plan the agent pasted the CAD viewer's link, with its access token, into the chat.",
    prompt:
      "The plate's job is in `parts/plate.cam.json`, for my GRBL router. Plan it into `CAM/` and show me the toolpaths.",
    files: { "parts/plate.step": PLATE_STEP, "parts/plate.cam.json": PLATE_JOB },
    skills: true,
    commands: { cad: CAD, "studio-install-freecad": STUDIO_FREECAD },
  },
  {
    id: "cam-freecad-consent",
    kind: "control",
    source:
      "Studio's cam skill (#136): with no FreeCAD for Studio, the agent asks before the download of about 650 MB, and installs nothing until the person says yes.",
    prompt:
      "I need CNC G-code to mill this plate, `parts/plate.step`, from 6061 on my GRBL router.",
    files: { "parts/plate.step": PLATE_STEP },
    skills: true,
    commands: {
      cad: [
        {
          args: "\\bplan\\b.*--job",
          stdout:
            "not planned: no FreeCAD 1.1 or newer found. Install FreeCAD for Studio with `studio-install-freecad`, then plan again.\n",
        },
        ...CAD,
      ],
      "studio-install-freecad": [
        {
          args: "--check",
          stdout: "Studio's FreeCAD is not installed. `studio-install-freecad` installs it.\n",
        },
      ],
    },
    mustMatch: ["650\\s?MB"],
    mustNotRun: ["^studio-install-freecad(?!.*--check)"],
  },
  {
    id: "cam-controller-recommended",
    kind: "bad",
    source:
      "Studio 0.1.19 retest, Haiku 5.5: after planning with defaults, the agent asked which controller with no answer marked (Recommended), and said what it planned with only after the answer.",
    prompt: "Make CNC G-code for this plate, `parts/plate.step`.",
    files: { "parts/plate.step": PLATE_STEP },
    skills: true,
    commands: { cad: CAD, "studio-install-freecad": STUDIO_FREECAD },
    mustRun: ["\\bplan\\b.*--job"],
    mustMatch: [
      "GRBL[^\\n]{0,60}\\(Recommended\\b|\\(Recommended\\b[^\\n]{0,20}GRBL",
      "10[,. ]?000\\s?(?:rpm|rev/min|r/min)",
      "(?:Ø|\\b)6(?:\\s?mm)?\\b[^\\n]{0,40}(?:end ?mill|flat|cutter)",
      "\\b3\\s?mm\\b[^\\n]{0,60}(?:margin|each side|stock|blank)|(?:margin|stock|blank)[^\\n]{0,60}\\b3\\s?mm\\b|106\\s?[x×]\\s?66",
      "\\b(?:vi[cs]e|clamp\\w*|tape|vacuum|held|hold(?:s|ing)?)\\b",
    ],
  },
  {
    id: "cam-controller-before-plan",
    kind: "bad",
    source:
      'Studio 0.1.19 retest, Haiku 5.5: with no FreeCAD for Studio yet, the agent asked which controller beside the download question, saying "I have planned with GRBL until you say", though no plan had run, and the job it wrote held the skill example values for `travel_mm` and `max_feed_mm_min`.',
    prompt: "Make CNC G-code for this plate, `parts/plate.step`.",
    files: { "parts/plate.step": PLATE_STEP },
    skills: true,
    commands: {
      cad: [
        {
          args: "\\bplan\\b.*--job",
          stdout:
            "not planned: no FreeCAD 1.1 or newer found. Install FreeCAD for Studio with `studio-install-freecad`, then plan again.\n",
        },
        ...CAD,
      ],
      "studio-install-freecad": [
        {
          args: "--check",
          stdout: "Studio's FreeCAD is not installed. `studio-install-freecad` installs it.\n",
        },
      ],
    },
    mustMatch: ["650\\s?MB"],
    mustNotMatch: [
      "\\b(?:I(?:'ve| have)(?: already)?|what I(?:'ve| have)?|I'm|I am|(?:it|this|the (?:plate|job|part|G-code)) (?:is|was|has been))\\s+(?:planned|planning)\\b",
      "(?:^|\\n)\\W*planned with\\b",
      "\\b(?:which|what) controller\\b[^.\\n]*\\?",
    ],
    mustNotRun: ["^studio-install-freecad(?!.*--check)"],
    writes: {
      path: "\\.json$",
      mustNotMatch: ['"travel_mm"', '"max_feed_mm_min"', '"min_rpm"'],
    },
  },
  {
    id: "cam-invented-limits",
    kind: "bad",
    source:
      "Studio 0.1.19 retest, Haiku 5.5: the CAM job the agent wrote set `travel_mm` [300, 300, 80] and `max_feed_mm_min` 2500, which nobody gave, while its reply said travel and feed limits were not known and not checked.",
    prompt: "Make CNC G-code for this plate, `parts/plate.step`.",
    files: { "parts/plate.step": PLATE_STEP },
    skills: true,
    commands: { cad: CAD, "studio-install-freecad": STUDIO_FREECAD },
    mustRun: ["\\bplan\\b.*--job"],
    mustMatch: [
      "travel[^.\\n]{0,80}(?:not (?:been )?checked|did(?: not|n't) check|unchecked)|(?:not|n't) check\\w*[^.\\n]{0,40}\\btravel\\b",
    ],
    writes: {
      path: "\\.json$",
      mustNotMatch: ['"travel_mm"', '"max_feed_mm_min"', '"min_rpm"'],
    },
  },
  {
    id: "cam-freecad-installs-in-turn",
    kind: "bad",
    source:
      "Studio 0.1.19 retest, Haiku 5.5: once the person said yes to FreeCAD, `studio-install-freecad` ran past the agent's 120 s command limit and went to the background, and the turn ended on a message naming GRBL as the controller before any plan had run.",
    prompt:
      "I need CNC G-code to mill this plate, `parts/plate.step`, from 6061 on my router. FreeCAD is not installed for Studio yet: yes, install it, the 650 MB download is fine.",
    files: { "parts/plate.step": PLATE_STEP },
    skills: true,
    commands: { cad: CAD, "studio-install-freecad": FREECAD_INSTALLING },
    mustRun: ["^studio-install-freecad(?!.*--check)", "\\bplan\\b.*--job"],
    beforeRun: {
      run: "\\bplan\\b.*--job",
      mustNotMatch: [
        "\\bGRBL\\b",
        "\\bcontroller\\b",
        "\\bI(?:'ve| have)(?: already)? planned\\b",
        "(?:^|\\n)\\W*planned with\\b",
      ],
    },
  },
  {
    id: "part-step-from-its-script",
    kind: "bad",
    source:
      "Studio 0.1.19 retest: the agent wrote `parts/flat_plate.py` with `cad.sketch`, ran it with the computer's own `python3` (`No module named 'cad'`), and exported `parts/flat_plate.step` from \"a plain build123d version of the same geometry, because the sketch helper only runs inside Studio\".",
    prompt:
      "A flat plate 80 x 50 x 6 mm with one Ø10 mm through hole in the middle, in 6061-T6 aluminium. Its script is `parts/flat_plate.py`.",
    skills: true,
    commands: { cad: CAD_BUILDS, python3: MACHINE_PYTHON, python: MACHINE_PYTHON },
    mustRun: ["^cad run\\b.*\\bflat_plate\\.py\\b", "^cad model export\\b.*\\.step\\b"],
    mustNotRun: [
      "^cad run\\b.*\\bparts/(?!flat_plate\\.py\\b)\\S*\\.py\\b",
      "^python3?\\b.*\\bexport_step\\b",
      "^cad model export\\s+0b4d2c1e",
    ],
    mustNotMatch: [
      "only runs inside Studio",
      "plain build123d",
      "(?:have not|haven't)(?: yet)? run the\\b[^.\\n]{0,30}script",
    ],
    // The part's script is the one written: no copy of it in another part script.
    writes: { path: "^parts/(?!flat_plate\\.py$).*\\.py$", mustNotMatch: ["\\S"] },
  },
  {
    id: "assembly-imports-parts",
    kind: "bad",
    source:
      "Studio 0.1.19 retest: the agent wrote `assemblies/flat_plate_bolt.py` with `from flat_plate import flat_plate`, which neither a run nor the part tree can import from `assemblies/` (`ModuleNotFoundError: No module named 'flat_plate'`).",
    prompt:
      "Make an assembly of the flat plate (`parts/flat_plate.py`) with an M8 x 20 bolt standing in its centre hole. Model the bolt as a plain cylinder with a hex head.",
    files: {
      "parts/flat_plate.py": [
        "import build123d as bd",
        "from cad import model",
        "",
        "",
        "@model",
        "def flat_plate():",
        "    plate = bd.Box(80, 50, 6, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))",
        "    return plate - bd.Pos(0, 0, 3) * bd.Cylinder(4.5, 6)",
        "",
      ].join("\n"),
    },
    skills: true,
    commands: {
      cad: [
        { args: "^--version$", stdout: "cad 0.11.17\n" },
        { args: "^run\\b", stdout: "" },
      ],
    },
    writes: {
      path: "^assemblies/.*\\.py$",
      mustMatch: ["sys\\.path\\.(?:insert|append)\\(", "[\"']parts[\"']"],
    },
  },
  {
    id: "bolt-thread-one-value",
    kind: "control",
    source:
      'Studio 0.1.19 retest, Haiku 5.5: on a bolted plate the agent said both "6 mm of thread runs below the nut" and "M8 × 20 leaves 5.4 mm of thread below the nut". Asked here in one turn, Haiku gave one value on the old text too.',
    prompt:
      "The plate now has an M8 x 20 bolt, washer and nut through its hole (`assemblies/plate_assembly.py`). Tell me how the stack sits, and whether the bolt is long enough.",
    files: BOLTED_PLATE,
    mustMatch: ["5\\.4\\s?mm"],
    sameValue: [
      "(?<![\\d.])(\\d+(?:\\.\\d+)?)\\s?mm (?:of )?(?:the )?(?:bolt(?:'s)? )?(?:thread|shank|bolt)\\w*[^.\\n\\d]{0,30}?\\b(?:below|beyond|past|under|out of|through|clear of)\\b[^.\\n\\d]{0,12}\\bnut\\b",
      "(?:protrud\\w*|sticks? out|projects?)\\b[^.\\n\\d]{0,30}?(\\d+(?:\\.\\d+)?)\\s?mm",
    ],
  },
  {
    id: "material-fact",
    kind: "control",
    source: "Ordinary question: the reply answers it with the number.",
    prompt: "What's the yield strength of 6061-T6?",
    mustMatch: ["2[4-8]\\d\\s?MPa"],
  },
];

/**
 * A yes/no offer to do the work. "What would you like me to do?" over named answers and "Which one
 * should I start with?" are choices, not offers.
 */
export const YES_NO_OFFER =
  /(?<!\b(?:what|which)(?: one)? )\b(?:would|do) you (?:like|want) me to\b|(?<!\b(?:what|which)(?: one)? (?:would|do) )\byou want me to\b|(?:^|[.!?:]\s+)(?:(?:shall|should) i|want me to)\b|\blet me know if you(?:'d| would)? (?:like|want)\b/im;

/** A link to the CAD server's pages, which carries its access token: Studio shows results in its own tabs. */
export const VIEWER_URL = /\?token=|\bhttps?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])[:/]/i;

/** One quantity said with two numbers ("6 mm of thread below the nut", then "5.4 mm"). */
const sameValueFailures = (patterns: ReadonlyArray<string>, reply: string) => {
  const values = new Set(
    patterns.flatMap((pattern) =>
      [...reply.matchAll(new RegExp(pattern, "gi"))].map((match) => Number(match[1])),
    ),
  );
  return values.size > 1 ? [`two values: ${[...values].join(" mm and ")} mm`] : [];
};

/** What the agent wrote that `writes` asks about: failures naming the file and the words. */
const writesFailures = (
  writes: NonNullable<StudioReplyCase["writes"]>,
  written: Readonly<Record<string, string>>,
) => {
  const files = Object.entries(written).filter(([path]) => new RegExp(writes.path, "i").test(path));
  if (files.length === 0 && writes.mustMatch?.length) return [`wrote no file /${writes.path}/`];
  return [
    ...(writes.mustMatch ?? [])
      .filter((pattern) => !files.some(([, text]) => new RegExp(pattern, "i").test(text)))
      .map((pattern) => `no written file has /${pattern}/`),
    ...files.flatMap(([path, text]) =>
      (writes.mustNotMatch ?? [])
        .filter((pattern) => new RegExp(pattern, "i").test(text))
        .map((pattern) => `${path} has /${pattern}/`),
    ),
  ];
};

/** What the agent wrote before its first command matching `run` (all it wrote, when none did). */
const beforeRunFailures = (
  beforeRun: NonNullable<StudioReplyCase["beforeRun"]>,
  steps: ReadonlyArray<TurnStep>,
) => {
  const first = steps.findIndex(
    (step) => "command" in step && new RegExp(beforeRun.run, "i").test(step.command),
  );
  const before = (first === -1 ? steps : steps.slice(0, first))
    .flatMap((step) => ("text" in step ? [step.text] : []))
    .join("\n");
  return beforeRun.mustNotMatch
    .filter((pattern) => new RegExp(pattern, "i").test(before))
    .map(
      (pattern) =>
        `said before /${beforeRun.run}/ ran: ${new RegExp(pattern, "i").exec(before)?.[0]}`,
    );
};

/**
 * `ran`: the command lines the agent ran, as `cad step plan …`; `written`: the files it wrote or
 * changed in the project, by path; `steps`: each text it wrote and each command it ran, in order.
 */
export const gradeReply = (
  testCase: StudioReplyCase,
  reply: string,
  ran: ReadonlyArray<string> = [],
  written: Readonly<Record<string, string>> = {},
  steps: ReadonlyArray<TurnStep> = [{ text: reply }],
) => {
  const failures = [
    ...(YES_NO_OFFER.test(reply) ? [`yes/no offer: ${YES_NO_OFFER.exec(reply)?.[0]}`] : []),
    ...(VIEWER_URL.test(reply) ? [`viewer link: ${VIEWER_URL.exec(reply)?.[0]}`] : []),
    ...(testCase.mustMatch ?? [])
      .filter((pattern) => !new RegExp(pattern, "i").test(reply))
      .map((pattern) => `missing /${pattern}/`),
    ...(testCase.mustNotMatch ?? [])
      .filter((pattern) => new RegExp(pattern, "i").test(reply))
      .map((pattern) => `said /${pattern}/: ${new RegExp(pattern, "i").exec(reply)?.[0]}`),
    ...(testCase.mustRun ?? [])
      .filter((pattern) => !ran.some((line) => new RegExp(pattern, "i").test(line)))
      .map((pattern) => `never ran /${pattern}/`),
    ...(testCase.mustNotRun ?? [])
      .filter((pattern) => ran.some((line) => new RegExp(pattern, "i").test(line)))
      .map((pattern) => `ran /${pattern}/`),
    ...sameValueFailures(testCase.sameValue ?? [], reply),
    ...(testCase.writes ? writesFailures(testCase.writes, written) : []),
    ...(testCase.beforeRun ? beforeRunFailures(testCase.beforeRun, steps) : []),
  ];
  return { pass: failures.length === 0, failures };
};
