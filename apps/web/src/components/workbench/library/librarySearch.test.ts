import type { InstalledPlugin, PluginSkillDetail, StudioSample } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { LIBRARY_DOCUMENTS, librarySkills } from "./libraryCatalog";
import {
  documentGroup,
  filterLibrary,
  findInLibrary,
  libraryGroup,
  skillGroup,
  toolboxLibraryLink,
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
  it("stands each skill on the popup's tab for its jobs, and one whose jobs span tabs in Design", () => {
    expect(skillGroup("cad")).toBe("Design");
    expect(skillGroup("pcb")).toBe("Design");
    expect(skillGroup("robot-simulation")).toBe("Document");
    expect(skillGroup("print3d")).toBe("Make");
    expect(skillGroup("fea")).toBe("Check");
    expect(skillGroup("cam")).toBe("Make");
    expect(skillGroup("sendcutsend")).toBe("Make");
    expect(skillGroup("engineering-drawing")).toBe("Document");
    expect(skillGroup("work-instructions")).toBe("Document");
    expect(skillGroup("render")).toBe("Document");
  });

  it("stands each job skill on its job's tab", () => {
    expect(skillGroup("fdm")).toBe("Check");
    expect(skillGroup("export")).toBe("Make");
    expect(skillGroup("fit")).toBe("Check");
    expect(skillGroup("board-check")).toBe("Check");
    expect(skillGroup("exploded")).toBe("Document");
  });

  it("files a type no skill makes as a document, not under Design", () => {
    expect(documentGroup(doc("doc:prd"))).toBe("Document");
    expect(documentGroup(doc("doc:parts-list"))).toBe("Document");
  });
});

describe("libraryGroup", () => {
  it("lists a document type once: under its first job's tab, else under Design", () => {
    expect(libraryGroup(doc("doc:part"))).toBe("Design");
    expect(libraryGroup(doc("doc:prd"))).toBe("Design");
    expect(libraryGroup(doc("doc:simulation"))).toBe("Check");
    expect(libraryGroup(doc("doc:cam-job"))).toBe("Make");
    expect(libraryGroup(doc("doc:drawing"))).toBe("Document");
  });
});

describe("toolboxLibraryLink", () => {
  it("opens the Toolbox page on the tab's own shelf, coming back here while the workspace can take a request", () => {
    expect(toolboxLibraryLink("Check", { workspaceOpen: true, from: "/chat/t1" }).search).toEqual({
      group: "Check",
      from: "/chat/t1",
    });
    expect(toolboxLibraryLink("Design", { workspaceOpen: false, from: "/" }).search).toEqual({
      group: "Design",
    });
  });

  it("leaves out where to come back to when no workspace is open", () => {
    expect(toolboxLibraryLink("Document", { workspaceOpen: false, from: "/chat/t1" })).toEqual({
      to: "/library",
      search: { group: "Document" },
    });
  });
});

describe("validateLibrarySearch", () => {
  it("keeps an entry, a group and the page it was opened from", () => {
    expect(
      validateLibrarySearch({ entry: "doc:part", group: "Check", from: "/env-1/thread-9" }),
    ).toEqual({ entry: "doc:part", group: "Check", from: "/env-1/thread-9" });
  });

  it("ignores an unknown group, and a page outside the app or the library itself", () => {
    // Every key is set, so a bad value in the URL can't show through the router's raw search.
    expect(
      validateLibrarySearch({ entry: 7, group: "Evaluate", from: "//example.com" }),
    ).toStrictEqual({ entry: undefined, group: undefined, from: undefined });
    expect(validateLibrarySearch({ from: "https://example.com" }).from).toBeUndefined();
    expect(validateLibrarySearch({ from: "/library?group=New" }).from).toBeUndefined();
  });
});
