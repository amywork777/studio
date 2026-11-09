// @effect-diagnostics nodeBuiltinImport:off - checks the sample project's files and text-to-cad's skill folders on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { InstalledPlugin, PluginSkillDetail } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS } from "../hardwareActions";
import { DOCUMENT_TEMPLATES, NEW_TEMPLATES, type NewTemplate } from "../newTemplates";
import {
  availability,
  entryOfAction,
  entryOfTemplate,
  findItIn,
  LIBRARY_DOCUMENTS,
  librarySkills,
  madeBy,
  skillsBehind,
  makeOneTemplate,
  ownTemplateEntries,
  showsUpAs,
  skillName,
  plainPrompt,
} from "./libraryCatalog";
import libraryExamples from "./libraryExamples.json";

const ROOT = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const SAMPLES = NodePath.join(ROOT, "studio-sample");
const SKILLS = NodePath.join(ROOT, "text-to-cad", "skills");

/** text-to-cad's skills: the folders of its skills/ that hold a SKILL.md. */
const TEXT_TO_CAD_SKILLS = NodeFS.readdirSync(SKILLS)
  .filter((name) => NodeFS.existsSync(NodePath.join(SKILLS, name, "SKILL.md")))
  .toSorted();

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\w-]+/)
    .filter(Boolean);

/** A text-to-cad skill's own name: `interface.display_name` in its agents/openai.yaml. */
const ownName = (skill: string) =>
  /^\s+display_name:\s*["']?(.*?)["']?\s*$/m.exec(
    NodeFS.readFileSync(NodePath.join(SKILLS, skill, "agents", "openai.yaml"), "utf8"),
  )?.[1] ?? null;

/** The words of a text-to-cad skill's `interface.short_description`, in lower case. */
const ownWords = (skill: string) =>
  wordsOf(
    /^\s+short_description:\s*["']?(.*?)["']?\s*$/m.exec(
      NodeFS.readFileSync(NodePath.join(SKILLS, skill, "agents", "openai.yaml"), "utf8"),
    )?.[1] ?? "",
  );

/** The sample's outputs that could not be made, so their entries show no example. */
const NOT_MADE = [
  "doc:print",
  "doc:circuit-board",
  "skill:text-to-cad/pcb",
  "skill:text-to-cad/print3d",
  "skill:text-to-cad/work-instructions",
];

const EXAMPLES: Readonly<Record<string, { sample?: string; example: string } | null>> =
  libraryExamples;

const doc = (id: string) => LIBRARY_DOCUMENTS.find((entry) => entry.id === id)!;

const detail = (name: string, defaultPrompt: string | null = null): PluginSkillDetail => ({
  name,
  displayName: null,
  description: `What ${name} does.`,
  defaultPrompt,
});

const plugin = (
  id: string,
  enabled: boolean,
  details: ReadonlyArray<PluginSkillDetail>,
): InstalledPlugin => ({
  id,
  displayName: `The ${id} plugin`,
  description: "",
  version: null,
  publisher: null,
  enabled,
  marketplace: null,
  commit: null,
  skills: details.map((entry) => entry.name),
  skillDetails: details,
  servers: [],
  views: [],
  compatibility: { level: "works", label: "Works", notes: [] },
  updateAvailable: false,
  error: null,
});

const textToCad = (enabled: boolean, defaultPrompt: string | null = null) =>
  plugin(
    "text-to-cad",
    enabled,
    TEXT_TO_CAD_SKILLS.map((name) => detail(name, defaultPrompt)),
  );

/** One of the person's own templates, as `documentTemplates.ts`'s `fileTemplate` makes it. */
const fileTemplate: NewTemplate = {
  id: "file:/p/Templates/Supplier audit.md",
  discipline: "Documents",
  label: "Supplier audit",
  description: "Your template, Supplier audit.md",
  skill: null,
  source: "new",
  folder: "docs",
  defaultName: "Supplier audit",
  file: "/p/Templates/Supplier audit.md",
};

describe("library catalog", () => {
  it("maps every offered template and every menu job to exactly one entry", () => {
    const templates = [...NEW_TEMPLATES, ...DOCUMENT_TEMPLATES].map((template) => template.id);
    for (const id of templates) {
      expect(
        LIBRARY_DOCUMENTS.filter((entry) => entry.templates.includes(id)),
        id,
      ).toHaveLength(1);
    }
    for (const { id } of HARDWARE_ACTIONS) {
      expect(
        LIBRARY_DOCUMENTS.filter((entry) => entry.actions.includes(id)),
        id,
      ).toHaveLength(1);
    }
    const jobs = new Set(HARDWARE_ACTIONS.map((job) => job.id));
    expect(
      LIBRARY_DOCUMENTS.flatMap((entry) => entry.templates).filter((id) => !templates.includes(id)),
    ).toEqual([]);
    expect(
      LIBRARY_DOCUMENTS.flatMap((entry) => entry.actions).filter((id) => !jobs.has(id)),
    ).toEqual([]);
  });

  it("keeps one entry for an id a template and a job share", () => {
    for (const id of ["drawing", "test-plan", "instructions"]) {
      expect(entryOfTemplate(id)?.id).toBe(`doc:${id}`);
      expect(entryOfAction(id)?.id).toBe(`doc:${id}`);
    }
  });

  it("uses the code's own labels", () => {
    const names = LIBRARY_DOCUMENTS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect(entryOfAction("strength")?.name).toBe("Simulation");
  });

  it("says where it is", () => {
    expect(findItIn(doc("doc:part"))).toEqual(["New › CAD"]);
    expect(findItIn(doc("doc:drawing"))).toEqual(["Documents › Drawings"]);
    expect(findItIn(doc("doc:simulation"))).toContain("Analysis › Simulation");
    expect(findItIn(doc("doc:order"))).toEqual(["Manufacturing › Sheet metal and cutting"]);
  });

  it("says New only where New makes it from nothing", () => {
    // Every New offers only the templates made from nothing; one that works from a part (a
    // drawing, a study) is found through its entry's menu jobs.
    const fromNothing = new Set(
      [...NEW_TEMPLATES, ...DOCUMENT_TEMPLATES]
        .filter((template) => template.source === "new")
        .map((template) => template.id),
    );
    for (const entry of LIBRARY_DOCUMENTS) {
      const places = findItIn(entry);
      expect(places, entry.id).not.toEqual([]);
      expect(
        places.some((place) => place.startsWith("New ›")),
        entry.id,
      ).toBe(entry.templates.some((id) => fromNothing.has(id)));
    }
  });

  it("finds the skill behind a document type, and none behind a plain template", () => {
    const byId = (id: string) => LIBRARY_DOCUMENTS.find((entry) => entry.id === id)!;
    expect(skillsBehind(byId("doc:cam-job"))).toContain("cam");
    expect(skillsBehind(byId("doc:prd"))).toEqual([]);
  });

  it("names who makes it", () => {
    expect(madeBy(doc("doc:prd"))).toEqual(["the Product requirements (PRD) template"]);
    expect(madeBy(doc("doc:order"))).toEqual(["sendcutsend"]);
    expect(madeBy(doc("doc:manufacturing-check"))).toEqual(["cad"]);
    expect(madeBy(doc("doc:circuit-board"))).toEqual(["pcb"]);
    // Off-the-shelf parts need no skill since step-parts left text-to-cad.
    expect(madeBy(doc("doc:standard-parts"))).toEqual(["the agent"]);
    expect(madeBy(doc("doc:parts-list"))).toEqual(["the agent"]);
    expect(madeBy(doc("doc:drawing"))).toEqual(["engineering-drawing"]);
    // Its template works from a part, which no New offers, and its job needs no skill.
    expect(madeBy(doc("doc:test-plan"))).toEqual(["the agent"]);
    expect(madeBy(doc("doc:instructions"))).toEqual(["work-instructions"]);
  });

  it("offers Make one only for what New makes from nothing", () => {
    expect(makeOneTemplate(doc("doc:part"))?.id).toBe("part");
    expect(makeOneTemplate(doc("doc:drawing"))).toBeNull();
    expect(makeOneTemplate(doc("doc:exploded"))).toBeNull();
  });

  it("names a skill that is off", () => {
    const off = [textToCad(false)];
    expect(availability(doc("doc:simulation"), off)).toEqual({
      on: false,
      skill: "fea",
      plugin: "text-to-cad",
      installed: true,
    });
    expect(availability(doc("doc:part"), [])).toEqual({
      on: false,
      skill: "cad",
      plugin: "text-to-cad",
      installed: false,
    });
    expect(availability(doc("doc:prd"), off)).toEqual({ on: true });
    expect(availability(doc("doc:prd"), [])).toEqual({ on: true });
    expect(availability(doc("doc:simulation"), [textToCad(true)])).toEqual({ on: true });
  });

  it("is on when any one of its templates or jobs is offered", () => {
    const printing = plugin("printing", true, [detail("print3d")]);
    expect(availability(doc("doc:print"), [printing])).toEqual({ on: true });
  });

  it("names the installed plugin that lists a missing skill", () => {
    const simulations = plugin("simulations", false, [detail("fea")]);
    expect(availability(doc("doc:simulation"), [simulations])).toEqual({
      on: false,
      skill: "fea",
      plugin: "simulations",
      installed: true,
    });
  });

  it("lists every skill of every installed plugin", () => {
    const harnesses = plugin("harnesses", true, [
      {
        name: "harness",
        displayName: "Wiring harness",
        description: "Draws wiring harnesses.",
        defaultPrompt: "Draw the harness for the arm.",
      },
    ]);
    const skills = librarySkills([textToCad(false), harnesses]);
    expect(skills.map((skill) => skill.id)).toEqual([
      ...TEXT_TO_CAD_SKILLS.map((name) => `skill:text-to-cad/${name}`),
      "skill:harnesses/harness",
    ]);
    expect(skills.filter((skill) => skill.pluginId === "text-to-cad" && skill.on)).toEqual([]);
    expect(skills.at(-1)).toEqual({
      kind: "skill",
      id: "skill:harnesses/harness",
      pluginId: "harnesses",
      pluginName: "The harnesses plugin",
      name: "harness",
      displayName: "Wiring harness",
      description: "Draws wiring harnesses.",
      blurb: "Draws wiring harnesses.",
      tryAsking: "Draw the harness for the arm.",
      on: true,
      example: null,
      exampleIn: null,
    });
  });

  it("gives a skill one name: its plugin's, else text-to-cad's own, else the chat's title-casing", () => {
    const skills = librarySkills([
      plugin("text-to-cad", true, [
        { ...detail("print3d"), displayName: "Printing" },
        detail("pcb-dfm"),
      ]),
    ]);
    expect(skills.map((skill) => skill.displayName)).toEqual(["Printing", "Pcb Dfm"]);
    expect(skillName("print3d", skills)).toBe("Printing");
    expect(skillName("pcb-dfm", skills)).toBe("Pcb Dfm");
    // Not installed: no plugin names it, so it reads as text-to-cad names it, else as the chat
    // would title it.
    expect(skillName("sendcutsend", skills)).toBe("SendCutSend");
    expect(skillName("harness", skills)).toBe("Harness");
    expect(madeBy(doc("doc:print"), (skill) => skillName(skill, skills))).toEqual(["Printing"]);
    expect(madeBy(doc("doc:robot"), (skill) => skillName(skill, skills))).toEqual([
      "Robot simulation",
    ]);
    expect(madeBy(doc("doc:prd"), (skill) => skillName(skill, skills))).toEqual([
      "the Product requirements (PRD) template",
    ]);
  });

  it("names each of text-to-cad's skills as its own files do, installed or not", () => {
    const job: Record<string, string> = { fea: "Simulation" };
    const named = TEXT_TO_CAD_SKILLS.map((name) => [name, job[name] ?? ownName(name)]);
    expect(named.filter(([, name]) => name === null)).toEqual([]);
    const installed = librarySkills([
      plugin(
        "text-to-cad",
        false,
        TEXT_TO_CAD_SKILLS.map((name) => ({ ...detail(name), displayName: ownName(name) })),
      ),
    ]);
    expect(TEXT_TO_CAD_SKILLS.map((name) => [name, skillName(name, installed)])).toEqual(named);
    expect(TEXT_TO_CAD_SKILLS.map((name) => [name, skillName(name, [])])).toEqual(named);
  });

  it("asks something of the sample for each of text-to-cad's skills", () => {
    const skills = librarySkills([textToCad(true, "Use this skill.")]);
    expect(skills).toHaveLength(9);
    expect(
      skills.filter((skill) => skill.tryAsking === null || skill.tryAsking === "Use this skill."),
    ).toEqual([]);
  });

  it("cuts each of text-to-cad's blurbs from its own words, whole, and leaves other plugins' alone", () => {
    const skills = librarySkills([textToCad(true), plugin("harnesses", true, [detail("harness")])]);
    const ours = skills.filter((skill) => skill.pluginId === "text-to-cad");
    expect(ours.filter((skill) => skill.blurb === skill.description)).toEqual([]);
    expect(
      ours.flatMap((skill) => {
        const own = ownWords(skill.name);
        return wordsOf(skill.blurb).filter((word) => !own.includes(word));
      }),
    ).toEqual([]);
    expect(ours.filter((skill) => /\.$|…/.test(skill.blurb))).toEqual([]);
    expect(skills.at(-1)?.blurb).toBe("What harness does.");
  });

  it("shows each skill where New and the menus offer it", () => {
    expect(showsUpAs("print3d")).toEqual(["Manufacturing: Slice and print"]);
    expect(showsUpAs("pcb")).toEqual([
      "Analysis: Board checks, Review before ordering",
      "Manufacturing: Fabrication files, Board STEP",
    ]);
    // A template that works from a part is no New's: the skill shows up in its menus alone.
    expect(showsUpAs("fea")).toEqual(["Analysis: Strength under load"]);
    expect(showsUpAs("robot-simulation")).toEqual([
      "New: Robot description",
      "Documents: More documents",
    ]);
    expect(showsUpAs("sendcutsend")).toEqual(["Manufacturing: Check for SendCutSend"]);
    expect(showsUpAs("no-such-skill")).toEqual([]);
  });

  it("gives each own template its own entry", () => {
    const own = ownTemplateEntries([fileTemplate])[0]!;
    expect(own).toMatchObject({
      id: "own:/p/Templates/Supplier audit.md",
      name: "Supplier audit",
      example: null,
    });
    expect(makeOneTemplate(own)).toEqual(fileTemplate);
    expect(findItIn(own)).toEqual(["New › Documents"]);
    expect(madeBy(own)).toEqual(["the Supplier audit template"]);
    expect(availability(own, [])).toEqual({ on: true });
  });

  it("has a real example for every entry", () => {
    expect(TEXT_TO_CAD_SKILLS).toHaveLength(9);
    const entries = [...LIBRARY_DOCUMENTS, ...librarySkills([textToCad(true)])];
    expect(Object.keys(EXAMPLES).toSorted()).toEqual(entries.map((entry) => entry.id).toSorted());
    expect(entries.filter((entry) => entry.example === null).map((entry) => entry.id)).toEqual(
      NOT_MADE,
    );
    // Each file in the example its entry names, the servo bracket where it names none.
    const files = entries.flatMap((entry) =>
      entry.example === null ? [] : [NodePath.join(entry.exampleIn!, entry.example)],
    );
    expect(files.filter((file) => !NodeFS.existsSync(NodePath.join(SAMPLES, file)))).toEqual([]);
  });

  it("opens 3D PMI's example on the motor mount's plate, the part that carries PMI", () => {
    expect(LIBRARY_DOCUMENTS.find((entry) => entry.id === "doc:pmi")).toMatchObject({
      example: "parts/motor_plate.py",
      exampleIn: "motor-mount",
    });
    const plate = NodeFS.readFileSync(
      NodePath.join(SAMPLES, "motor-mount", "parts", "motor_plate.py"),
      "utf8",
    );
    expect(plate).toMatch(/from cad\.build123d import \(annotate,/);
    expect(plate).toMatch(/annotate\(/);
  });
});

describe("a skill's own prompt", () => {
  it("reads as a person would ask, with no raw skill names", () => {
    expect(plainPrompt("Use $cad to create or edit the CAD model I describe.")).toBe(
      "Create or edit the CAD model I describe.",
    );
    expect(plainPrompt("Check this with $my-fea first.")).toBe("Check this with my-fea first.");
    expect(plainPrompt("Keep it under $20.")).toBe("Keep it under $20.");
    expect(plainPrompt("Make a bracket.")).toBe("Make a bracket.");
  });
});

describe("Studio's job skills on the Toolbox page (jobSkills.ts)", () => {
  // text-to-cad's plugin as Studio lays it out: its own skills, then Studio's job skills, each with
  // its openai.yaml face as studio-job-skills/ writes it.
  const laidOut = plugin("text-to-cad", true, [
    detail("pcb"),
    {
      name: "fdm",
      displayName: "Check for FDM printing",
      description: "Findings for FDM printing, each passing, to fix or to check, with the fix.",
      defaultPrompt: "Use $fdm to check the part for FDM printing.",
    },
    { ...detail("board-fab"), displayName: "Fabrication files" },
    detail("cad"),
  ]);
  const tiles = librarySkills([laidOut]);
  const tileOf = (name: string) => tiles.find((tile) => tile.name === name);

  it("puts text-to-cad's own skills first, then the job skills in the menus' order", () => {
    expect(tiles.map((tile) => tile.name)).toEqual(["pcb", "cad", "fdm", "board-fab"]);
  });

  it("names a job skill as its job, by the skill that does it, with its job's example", () => {
    expect(tileOf("fdm")).toMatchObject({
      displayName: "Check for FDM printing",
      blurb: "With the CAD skill",
      tryAsking: "Check the part for FDM printing.",
      ...exampleOfEntry("doc:manufacturing-check"),
    });
    expect(tileOf("board-fab")?.blurb).toBe("With the PCB skill");
  });

  it("says where its job shows up", () => {
    expect(showsUpAs("fdm")).toEqual(["Manufacturing: Check for FDM printing"]);
    expect(showsUpAs("board-fab")).toEqual(["Manufacturing: Fabrication files"]);
  });
});

/** A document type's example, as an entry that shares it shows. */
function exampleOfEntry(id: string) {
  const item = (libraryExamples as Record<string, { sample?: string; example: string } | null>)[id];
  return {
    example: item?.example ?? null,
    exampleIn: item === null || item === undefined ? null : (item.sample ?? "servo-bracket"),
  };
}
