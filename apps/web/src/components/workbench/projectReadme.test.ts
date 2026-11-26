import { describe, expect, it } from "vite-plus/test";

import {
  isPlainReadmeText,
  nextReadmeWriteIn,
  readmeHeading,
  readmeInline,
  readmeRows,
  readmeRuns,
  questionAnswer,
  readQuestion,
  readmeSections,
  type ReadmeWriteIn,
  replaceReadmeText,
  writtenWordDelays,
} from "./projectReadme";

const README = `# Lanyard clip

## What it is

Holds a phone lanyard on a camera strap's ring. It slips onto the ring's 3 mm wire.

## Decisions

- The opening is 3.4 mm, so it slips on easily (2026-10-19, asked)
- The outside edges are rounded 1.2 mm (2026-10-19, by hand)
- Printed in PETG

## Notes

- Not a decision
`;

describe("readmeSections", () => {
  it("reads the title, What it is and the Decisions", () => {
    const sections = readmeSections(README);
    expect(sections.title).toBe("Lanyard clip");
    expect(sections.whatItIs).toBe(
      "Holds a phone lanyard on a camera strap's ring. It slips onto the ring's 3 mm wire.",
    );
    expect(sections.decisions).toEqual([
      { text: "The opening is 3.4 mm, so it slips on easily", when: "2026-10-19", how: "asked" },
      { text: "The outside edges are rounded 1.2 mm", when: "2026-10-19", how: "by hand" },
      { text: "Printed in PETG", when: null, how: null },
    ]);
  });

  it("reads a decision that ends with a full stop after its note", () => {
    const sections = readmeSections(
      "## Decisions\n\n- Fasten the hook to a wood stud (2026-10-19, asked).\n",
    );
    expect(sections.decisions).toEqual([
      { text: "Fasten the hook to a wood stud", when: "2026-10-19", how: "asked" },
    ]);
  });

  it("reads a decision written date first, with where it came from", () => {
    const sections = readmeSections(
      "## Decisions\n\n- 2026-10-19 — Support the bike by its front wheel. Source: user brief.\n- 2026-10-20: Thicker arm. Source: hand edit.\n",
    );
    expect(sections.decisions).toEqual([
      { text: "Support the bike by its front wheel", when: "2026-10-19", how: "asked" },
      { text: "Thicker arm", when: "2026-10-20", how: "by hand" },
    ]);
  });

  it("reads Decision: lines an agent left outside a Decisions section", () => {
    const sections = readmeSections(
      "# Case\n\nA one-piece case.\n\nDecision: Use HP500N (2026-11-06, asked).\n\nDecision: Web 0.25 mm.\n",
    );
    expect(sections.whatItIs).toBe("A one-piece case.");
    expect(sections.decisions).toEqual([
      { text: "Use HP500N", when: "2026-11-06", how: "asked" },
      { text: "Web 0.25 mm.", when: null, how: null },
    ]);
  });

  it("keeps every other section, in order, as written", () => {
    const sections = readmeSections(
      "# Bike wall hook\n\nHolds a bike.\n\n## Open questions\n\nWall construction; bike weight.\n\n## Notes\n\n- Print it on its side\n- Use four screws\n",
    );
    expect(sections.whatItIs).toBe("Holds a bike.");
    expect(sections.more).toEqual([
      {
        heading: "Open questions",
        blocks: [{ kind: "paragraph", text: "Wall construction; bike weight." }],
      },
      {
        heading: "Notes",
        blocks: [
          { kind: "item", text: "Print it on its side", depth: 0 },
          { kind: "item", text: "Use four screws", depth: 0 },
        ],
      },
    ]);
  });

  it("keeps a section's prose, points and headings in the order written, points at their depth", () => {
    const { more } = readmeSections(
      "## Notes\n\nFirst.\n\n### Fit\n\n- Saddle\n  - Width 62 mm\n    - Assumed\n  - Depth 22 mm\n- Clamp\n\nNext: measure it\n",
    );
    expect(more[0]?.blocks).toEqual([
      { kind: "paragraph", text: "First." },
      { kind: "subheading", text: "Fit" },
      { kind: "item", text: "Saddle", depth: 0 },
      { kind: "item", text: "Width 62 mm", depth: 1 },
      { kind: "item", text: "Assumed", depth: 2 },
      { kind: "item", text: "Depth 22 mm", depth: 1 },
      { kind: "item", text: "Clamp", depth: 0 },
      { kind: "paragraph", text: "Next: measure it" },
    ]);
  });

  it("reads a paragraph of several sentences as points", () => {
    const { more } = readmeSections(
      "## Research\n\nThe mount fits a [P1P](https://a.example/b.c). It takes 2.5 mm pens, e.g. fineliners. Print it flat.\n",
    );
    expect(more[0]?.blocks).toEqual([
      { kind: "item", text: "The mount fits a [P1P](https://a.example/b.c).", depth: 0 },
      { kind: "item", text: "It takes 2.5 mm pens, e.g. fineliners.", depth: 0 },
      { kind: "item", text: "Print it flat.", depth: 0 },
    ]);
  });

  it("takes one list for each run of points", () => {
    const point = { kind: "item", text: "a", depth: 0 } as const;
    const line = { kind: "paragraph", text: "b" } as const;
    expect(readmeRuns([point, point, line, point])).toEqual([[point, point], line, [point]]);
  });

  it("keeps a parenthesis that is not a date or a how", () => {
    const sections = readmeSections("## Decisions\n\n- Wall 2 mm (thicker than the lid)\n");
    expect(sections.decisions).toEqual([
      { text: "Wall 2 mm (thicker than the lid)", when: null, how: null },
    ]);
  });

  it("takes the opening paragraph when there is no What it is", () => {
    expect(readmeSections("# Gear guard\n\nKeeps fingers out of the gears.\n").whatItIs).toBe(
      "Keeps fingers out of the gears.",
    );
  });

  it("does not take the README a new project starts with as what it is", () => {
    const started = [
      '<img src="assets/icon.svg" width="64" height="64" alt="">',
      "",
      "# Wall hook",
      "",
      "Created in [T3 Code](https://t3.codes).",
      "",
    ].join("\n");
    expect(readmeSections(started)).toEqual({
      title: "Wall hook",
      whatItIs: null,
      decisions: [],
      questions: [],
      more: [],
    });
    expect(readmeSections(`${started}\nHolds a bike up by its front wheel.\n`).whatItIs).toBe(
      "Holds a bike up by its front wheel.",
    );
  });

  it("asks the open questions as taps, the assumed answer first, and keeps prose ones as written", () => {
    const sections = readmeSections(
      "# Lamp\n\n## Open questions\n\n- Wall thickness? [2 mm | 3 mm]\n  - The arm flexes under 1 kg\n- Who prints it?\n\n## Notes\n\n- PLA\n",
    );
    expect(sections.questions).toEqual([
      { text: "Wall thickness?", answers: ["2 mm", "3 mm"] },
      { text: "Who prints it?", answers: [] },
    ]);
    expect(sections.more.map((section) => section.heading)).toEqual(["Notes"]);
    expect(questionAnswer(sections.questions[0]!, "3 mm")).toBe(
      'About the open question "Wall thickness?": 3 mm.',
    );
    expect(readQuestion("See the [datasheet](https://example.com)")).toEqual({
      text: "See the [datasheet](https://example.com)",
      answers: [],
    });
  });

  it("gives empty sections for a missing or empty README", () => {
    const empty = { title: null, whatItIs: null, decisions: [], questions: [], more: [] };
    expect(readmeSections(null)).toEqual(empty);
    expect(readmeSections("  \n")).toEqual(empty);
  });
});

describe("readmeInline", () => {
  it("splits a line into text, links and bold, and drops code marks", () => {
    expect(
      readmeInline("[First fit concept](parts/bike_hook.step) · **PETG** and `bike_hook.py`"),
    ).toEqual([
      { kind: "link", text: "First fit concept", target: "parts/bike_hook.step" },
      { kind: "text", text: " · " },
      { kind: "strong", text: "PETG" },
      { kind: "text", text: " and bike_hook.py" },
    ]);
    expect(readmeInline("Plain words")).toEqual([{ kind: "text", text: "Plain words" }]);
  });
});

describe("changing the README where the Overview shows it", () => {
  const readme = [
    "# Clip",
    "",
    "## What it is",
    "A clip that holds a camera",
    "to a tray.",
    "",
    "## Decisions",
    "- Print it in PETG (2026-10-19, asked).",
  ].join("\n");

  it("puts the new words where the old ones stood, however they were wrapped", () => {
    expect(
      replaceReadmeText(readme, "A clip that holds a camera to a tray.", "A clip for a camera."),
    ).toContain("## What it is\nA clip for a camera.\n\n## Decisions");
    expect(replaceReadmeText(readme, "Print it in PETG", "Print it in PLA")).toContain(
      "- Print it in PLA (2026-10-19, asked).",
    );
  });

  it("changes nothing when the words are gone or the new ones are empty", () => {
    expect(replaceReadmeText(readme, "Cast it in bronze", "Print it")).toBeNull();
    expect(replaceReadmeText(readme, "Print it in PETG", "  ")).toBeNull();
  });

  it("lets only plain words be typed into", () => {
    expect(isPlainReadmeText("Print it in PETG")).toBe(true);
    expect(isPlainReadmeText("See [the drawing](drawings/clip.pdf)")).toBe(false);
    expect(isPlainReadmeText("**Holds** 2 kg")).toBe(false);
  });
});

describe("a new project's README coming in", () => {
  const start: ReadmeWriteIn = { waited: false, first: null };

  it("writes in the words that end a wait, once", () => {
    const waiting = nextReadmeWriteIn(start, true, null);
    expect(waiting).toEqual({ waited: true, first: null });
    const arrived = nextReadmeWriteIn(waiting, true, "first words");
    expect(arrived.first).toBe("first words");
    // The agent's later changes do not take its place, so they read as they are.
    expect(nextReadmeWriteIn(arrived, true, "more words").first).toBe("first words");
  });

  it("writes nothing in when the README was there all along", () => {
    expect(nextReadmeWriteIn(start, true, "old words")).toEqual(start);
    expect(nextReadmeWriteIn(start, false, null)).toEqual(start);
  });

  it("paces words as writing, and a long README within the same time", () => {
    expect(writtenWordDelays(10)(4)).toBe(180);
    expect(writtenWordDelays(600)(599)).toBeLessThanOrEqual(1800);
  });
});

describe("readmeRows", () => {
  const section = (heading: string) => ({ heading, blocks: [] });

  it("lists Open actions first, however it is written, the rest in README order, and not its files", () => {
    const rows = readmeRows([
      section("Open questions"),
      section("Notes"),
      section("In this project"),
      section("OPEN ACTIONS — 2026-11-05"),
    ]);
    expect(rows.first.map((row) => row.heading)).toEqual(["OPEN ACTIONS — 2026-11-05"]);
    expect(rows.rest.map((row) => row.heading)).toEqual(["Open questions", "Notes"]);
  });

  it("has nothing first in a README without the heading", () => {
    expect(readmeRows([section("Open actions taken")]).first).toEqual([]);
  });
});

describe("readmeHeading", () => {
  it("takes the date off a dated heading, with the word before it", () => {
    expect(readmeHeading("Existing designs — researched 2026-11-05")).toEqual({
      title: "Existing designs",
      word: "researched",
      when: "2026-11-05",
    });
    expect(readmeHeading("EXISTING DESIGNS – RESEARCHED 2026-11-05").word).toBe("researched");
    expect(readmeHeading("Fit check - 2026-10-23")).toEqual({
      title: "Fit check",
      word: null,
      when: "2026-10-23",
    });
    expect(readmeHeading("Fit check (2026-10-23)").title).toBe("Fit check");
  });

  it("leaves any other heading as written", () => {
    for (const heading of [
      "Open questions",
      "Off-the-shelf parts",
      "2026-10-23",
      "Rev 2 - final",
    ]) {
      expect(readmeHeading(heading)).toEqual({ title: heading, word: null, when: null });
    }
  });
});
