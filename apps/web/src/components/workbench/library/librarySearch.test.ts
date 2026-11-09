import type { InstalledPlugin, PluginSkillDetail, StudioSample } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { LIBRARY_DOCUMENTS, librarySkills } from "./libraryCatalog";
import {
  documentGroup,
  filterLibrary,
  findInLibrary,
  libraryGroup,
  skillGroup,
  validateLibrarySearch,
} from "./librarySearch";

/** A display name that no document type's own words hold, so only the shown name can find it. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = { pcb: "Board layout" };

const detail = (name: string): PluginSkillDetail => ({
  name,
  displayName: DISPLAY_NAMES[name] ?? null,
  description: `What ${name} does.`,
  defaultPrompt: null,
});

const SKILLS = ["cad", "engineering-drawing", "fea", "pcb", "sendcutsend"];

/** text-to-cad, enabled, with the skills these searches reach. */
const fixturePlugins: ReadonlyArray<InstalledPlugin> = [
  {
    id: "text-to-cad",
    displayName: "text-to-cad",
    description: "",
    version: null,
    publisher: null,
    enabled: true,
    marketplace: null,
    commit: null,
    skills: SKILLS,
    skillDetails: SKILLS.map(detail),
    servers: [],
    views: [],
    compatibility: { level: "works", label: "Works", notes: [] },
    updateAvailable: false,
    error: null,
  },
];

const all = [...LIBRARY_DOCUMENTS, ...librarySkills(fixturePlugins)];
const found = (query: string) => filterLibrary(all, query).map((entry) => entry.id);
const doc = (id: string) => LIBRARY_DOCUMENTS.find((entry) => entry.id === id)!;

describe("filterLibrary", () => {
  it("finds a document type and a skill by name, whatever the case", () => {
    expect(found("DRAWING")).toEqual(
      expect.arrayContaining(["doc:drawing", "skill:text-to-cad/engineering-drawing"]),
    );
  });

  it("finds a document type by the skill that makes it", () => {
    expect(found("sendcutsend")).toContain("doc:order");
    expect(found("pcb")).toContain("doc:circuit-board");
  });

  it("finds a document type by its skill's name as the page shows it, and by its own name", () => {
    expect(found("board layout")).toEqual(
      expect.arrayContaining(["doc:circuit-board", "skill:text-to-cad/pcb"]),
    );
    expect(found("fea")).toContain("doc:simulation");
    // The job's one name stands for its skill, whatever the skill's own files say.
    expect(found("simulation")).toEqual(
      expect.arrayContaining(["doc:simulation", "skill:text-to-cad/fea"]),
    );
  });

  it("finds a document type by where it is", () => {
    expect(found("Analysis")).toContain("doc:simulation");
  });

  it("finds under New only what New makes from nothing", () => {
    const underNew = found("New");
    expect(underNew).toEqual(expect.arrayContaining(["doc:part", "doc:prd", "doc:robot"]));
    // Their templates work from a part, which no New offers.
    const fromPart = new Set([
      "doc:drawing",
      "doc:simulation",
      "doc:cam-job",
      "doc:print",
      "doc:cut-file",
      "doc:test-plan",
      "doc:instructions",
    ]);
    expect(underNew.filter((id) => fromPart.has(id))).toEqual([]);
  });

  it("lists everything for a blank search", () => {
    expect(filterLibrary(all, "  ")).toEqual(all);
  });
});

describe("findInLibrary", () => {
  const example = (id: string, name: string) =>
    ({ id, name, shows: ["Sheet metal"] }) as unknown as StudioSample;
  const examples = [
    example("servo-bracket", "Servo bracket"),
    example("shelf-bracket", "Shelf bracket"),
  ];

  it("finds the Library's examples by name, as its search box does", () => {
    const found = findInLibrary(examples, LIBRARY_DOCUMENTS, "bracket", 8);
    expect(found.examples.map((sample) => sample.name)).toEqual(["Servo bracket", "Shelf bracket"]);
    expect(findInLibrary(examples, LIBRARY_DOCUMENTS, "turbine", 8).examples).toEqual([]);
  });

  it("finds its document types", () => {
    const [first] = LIBRARY_DOCUMENTS;
    const found = findInLibrary([], LIBRARY_DOCUMENTS, first!.name, 8);
    expect(found.documents.map((entry) => entry.id)).toContain(first!.id);
  });

  it("finds nothing with nothing typed, and each list stops at its limit", () => {
    expect(findInLibrary(examples, LIBRARY_DOCUMENTS, "  ", 8)).toEqual({
      examples: [],
      documents: [],
    });
    expect(findInLibrary(examples, LIBRARY_DOCUMENTS, "bracket", 1).examples).toHaveLength(1);
  });
});

describe("the Toolbox's shelves", () => {
  it("stands each skill on the shelf of the work it does", () => {
    expect(skillGroup("cad")).toBe("New");
    expect(skillGroup("pcb")).toBe("New");
    expect(skillGroup("robot-simulation")).toBe("New");
    expect(skillGroup("print3d")).toBe("Manufacture");
    expect(skillGroup("fea")).toBe("Evaluate");
    expect(skillGroup("cam")).toBe("Manufacture");
    expect(skillGroup("work-instructions")).toBe("Document");
  });

  it("stands each job skill on the shelf of its job's menu", () => {
    expect(skillGroup("fdm")).toBe("Manufacture");
    expect(skillGroup("export")).toBe("Manufacture");
    expect(skillGroup("fit")).toBe("Evaluate");
    expect(skillGroup("board-check")).toBe("Evaluate");
    expect(skillGroup("exploded")).toBe("Document");
  });

  it("files a type no skill makes as a document, not under New", () => {
    expect(documentGroup(doc("doc:prd"))).toBe("Document");
    expect(documentGroup(doc("doc:parts-list"))).toBe("Document");
  });
});

describe("libraryGroup", () => {
  it("lists a document type once: under its first job's menu, else under New", () => {
    expect(libraryGroup(doc("doc:part"))).toBe("New");
    expect(libraryGroup(doc("doc:prd"))).toBe("New");
    expect(libraryGroup(doc("doc:simulation"))).toBe("Evaluate");
    expect(libraryGroup(doc("doc:cam-job"))).toBe("Manufacture");
    expect(libraryGroup(doc("doc:drawing"))).toBe("Document");
  });
});

describe("validateLibrarySearch", () => {
  it("keeps an entry, a group and the page it was opened from", () => {
    expect(
      validateLibrarySearch({ entry: "doc:part", group: "Evaluate", from: "/env-1/thread-9" }),
    ).toEqual({ entry: "doc:part", group: "Evaluate", from: "/env-1/thread-9" });
  });

  it("ignores an unknown group, and a page outside the app or the library itself", () => {
    // Every key is set, so a bad value in the URL can't show through the router's raw search.
    expect(
      validateLibrarySearch({ entry: 7, group: "Settings", from: "//example.com" }),
    ).toStrictEqual({ entry: undefined, group: undefined, from: undefined });
    expect(validateLibrarySearch({ from: "https://example.com" }).from).toBeUndefined();
    expect(validateLibrarySearch({ from: "/library?group=New" }).from).toBeUndefined();
  });
});
