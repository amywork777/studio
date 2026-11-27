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

export const gradeReply = (testCase: StudioReplyCase, reply: string) => {
  const failures = [
    ...(YES_NO_OFFER.test(reply) ? [`yes/no offer: ${YES_NO_OFFER.exec(reply)?.[0]}`] : []),
    ...(testCase.mustMatch ?? [])
      .filter((pattern) => !new RegExp(pattern, "i").test(reply))
      .map((pattern) => `missing /${pattern}/`),
  ];
  return { pass: failures.length === 0, failures };
};
