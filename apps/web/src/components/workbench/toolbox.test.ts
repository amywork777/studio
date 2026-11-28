import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS, hardwareActions } from "./hardwareActions";
import {
  jobCount,
  pairLoneSections,
  readToolboxTab,
  searchJobs,
  toolboxGroups,
  toolboxTabOf,
  toolboxStart,
  toolboxLeftOut,
  toolboxWorksOn,
  worksOnWords,
  writeToolboxTab,
} from "./toolbox";

const menus = () => hardwareActions("Part", new Set(["fea", "cad", "cam"]), "CNC machining");

describe("pairLoneSections", () => {
  const [tool] = menus().flatMap((menu) => menu.sections.flatMap((section) => section.actions));
  const sections = (...tiles: ReadonlyArray<number>) =>
    tiles.map((count, index) => ({
      title: `${index}`,
      actions: Array.from({ length: count }, () => tool!),
    }));
  const order = (...tiles: ReadonlyArray<number>) =>
    pairLoneSections(sections(...tiles)).map((section) => section.title);

  it("draws a lone section up to the one before, across a longer one", () => {
    expect(order(1, 2, 1)).toEqual(["0", "2", "1"]);
    expect(order(2, 1, 3, 1)).toEqual(["0", "1", "3", "2"]);
  });

  it("pairs them two by two and leaves the odd one where it was", () => {
    expect(order(1, 1, 1, 2)).toEqual(["0", "1", "2", "3"]);
    expect(order(1, 2, 1, 2, 1)).toEqual(["0", "2", "1", "3", "4"]);
  });

  it("keeps the order of sections with no lone tile to pair", () => {
    expect(order(2, 3, 4)).toEqual(["0", "1", "2"]);
    expect(order(2, 1, 2)).toEqual(["0", "1", "2"]);
  });
});

describe("toolboxGroups", () => {
  const tabOf = (id: string) => toolboxTabOf(HARDWARE_ACTIONS.find((job) => job.id === id)!);

  it("always gives the four tabs in order, empty when nothing applies", () => {
    const groups = toolboxGroups([]);
    expect(groups.map((group) => group.tab)).toEqual(["Design", "Check", "Make", "Document"]);
    expect(groups.every((group) => group.sections.length === 0)).toBe(true);
  });

  it("files each job by what it is for: shape it, check it, make it or document it", () => {
    expect(["brainstorm", "standard-parts"].map(tabOf)).toEqual(["Design", "Design"]);
    expect(["strength", "fit", "drawing-check", "board-check"].map(tabOf)).toEqual(
      Array(4).fill("Check"),
    );
    // A check that it can be made is a check, whichever way of making it it is for.
    expect(["cnc", "sheet-metal", "molding", "powder"].map(tabOf)).toEqual(Array(4).fill("Check"));
    expect(["slice", "toolpaths", "dxf", "export", "board-fab"].map(tabOf)).toEqual(
      Array(5).fill("Make"),
    );
    expect(["drawing", "pmi", "render", "write-up"].map(tabOf)).toEqual(Array(4).fill("Document"));
  });

  it("keeps the project's own way of making it first, in Check and in Make", () => {
    const [, check, make] = toolboxGroups(menus());
    const titles = (group: typeof check) => group?.sections.map((section) => section.title);
    expect(titles(check)).toContain("Simulation");
    expect(titles(check)).toContain("Machining and molding");
    expect(titles(make)?.[0]).toBe("Machining and molding");
    expect(make?.sections[0]?.actions.map((job) => job.id)).toEqual(["toolpaths"]);
  });

  it("lists every job exactly once", () => {
    const fromMenus = menus().flatMap((menu) =>
      [...menu.sections, ...menu.others].flatMap((section) => section.actions.map((a) => a.id)),
    );
    for (const pins of [[], ["strength", "slice", "gone"]]) {
      const fromGroups = toolboxGroups(menus(), pins).flatMap((group) =>
        group.sections.flatMap((section) => section.actions.map((a) => a.id)),
      );
      expect(fromGroups.toSorted()).toEqual(fromMenus.toSorted());
      expect(new Set(fromGroups).size).toBe(fromGroups.length);
    }
  });

  it("leads each tab with its own starred jobs, in the order starred", () => {
    const groups = toolboxGroups(
      hardwareActions(null, new Set(["fea", "cad", "cam"]), "CNC machining"),
      ["mass", "toolpaths", "strength", "gone"],
    );
    const first = (tab: string) => groups.find((group) => group.tab === tab)?.sections[0];
    expect(first("Check")).toEqual({
      title: "Starred",
      actions: [
        expect.objectContaining({ id: "mass" }),
        expect.objectContaining({ id: "strength" }),
      ],
    });
    expect(first("Make")?.actions.map((job) => job.id)).toEqual(["toolpaths"]);
    expect(first("Document")?.title).not.toBe("Starred");
  });
});

describe("the Toolbox tab", () => {
  it("opens on the tab left open on this device, else Design", () => {
    globalThis.localStorage?.removeItem("studio:toolbox-tab");
    expect(readToolboxTab()).toBe("Design");
    writeToolboxTab("Make");
    expect(readToolboxTab()).toBe(globalThis.localStorage ? "Make" : "Design");
    // The tabs before these, Yours among them, open on Design.
    for (const old of ["Yours", "Evaluate", "Nonsense"]) {
      globalThis.localStorage?.setItem("studio:toolbox-tab", old);
      expect(readToolboxTab()).toBe("Design");
    }
  });
});

describe("search", () => {
  const groups = toolboxGroups(
    hardwareActions(null, new Set(["fea", "cad", "cam", "fdm", "sheet-metal"]), "FDM printing"),
  );

  it("finds a job by every word typed, in any case", () => {
    const found = searchJobs(groups, "FDM check");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((job) => /fdm/i.test(`${job.label} ${job.gets}`))).toBe(true);
    expect(searchJobs(groups, "  ")).toEqual([]);
    expect(searchJobs(groups, "zzz-nothing")).toEqual([]);
  });

  it("finds a tab's jobs by its name", () => {
    const found = searchJobs(groups, "make");
    expect(found.map((job) => job.id)).toContain("toolpaths");
  });
});

describe("jobCount", () => {
  it("counts a tab's jobs in all its sections", () => {
    const [, check] = toolboxGroups(menus());
    const all = check?.sections.flatMap((section) => section.actions) ?? [];
    expect(check && jobCount(check)).toBe(all.length);
    expect(all.length).toBeGreaterThan(0);
    expect(toolboxGroups([]).map(jobCount)).toEqual([0, 0, 0, 0]);
  });
});

describe("the Toolbox, whatever file is in front", () => {
  const SKILLS = new Set(["fea", "cad", "cam", "sendcutsend", "pcb"]);
  const groups = toolboxGroups(hardwareActions(null, SKILLS));
  const group = (name: (typeof groups)[number]["tab"]) =>
    groups.find((entry) => entry.tab === name)!;
  const job = (id: string) => HARDWARE_ACTIONS.find((action) => action.id === id)!;

  it("holds every job the skills can do, a board's beside a part's", () => {
    const labels = groups.flatMap((entry) =>
      entry.sections.flatMap((section) => section.actions.map((action) => action.label)),
    );
    const offered = HARDWARE_ACTIONS.filter(
      (action) => action.skill === null || SKILLS.has(action.skill),
    ).map((action) => action.label);
    expect(labels.toSorted()).toEqual(offered.toSorted());
    expect(labels).toContain("Board checks");
    expect(labels).toContain("Strength under load");
  });

  it("lets a job run on a file it fits", () => {
    expect(toolboxWorksOn(job("board-check"), "Schematic")).toBeNull();
    expect(toolboxWorksOn(job("strength"), "Result")).toBeNull();
    expect(toolboxWorksOn(job("write-up"), "Document")).toBeNull();
  });

  it("says what a job works on where it does not fit the file in front", () => {
    expect(toolboxWorksOn(job("board-check"), "Part")).toBe(
      "Works on a board or a schematic. Open one to use it.",
    );
    expect(toolboxWorksOn(job("fit"), "Part")).toBe("Works on an assembly. Open one to use it.");
    expect(toolboxWorksOn(job("toolpaths"), "Board")).toBe(
      "Works on a part, a CAM job, or a CAM plan. Open one to use it.",
    );
    expect(toolboxWorksOn(job("strength"), "Board")).toBe(
      "Works on a part, an assembly, an FEA study, or a result. Open one to use it.",
    );
  });

  it("says what every job works on with no file open yet", () => {
    expect(toolboxWorksOn(job("board-fab"), null)).toBe("Works on a board. Open one to use it.");
    expect(toolboxWorksOn(job("write-up"), null)).toBe("Works on any file. Open one to use it.");
  });

  it("starts what a job works on, with New, where the project has none of it", () => {
    const kinds = (...names: ReadonlyArray<string>) => new Set(names);
    expect(toolboxStart(job("board-check"), kinds("Part"))?.id).toBe("board");
    expect(toolboxStart(job("fit"), kinds("Part"))?.id).toBe("assembly");
    expect(toolboxStart(job("board-check"), kinds())?.id).toBe("board");
    const board = toolboxStart(job("board-fab"), kinds("Part"));
    expect(toolboxWorksOn(job("board-fab"), "Part", board)).toBe(
      "Works on a board. This project has none yet: press to start one.",
    );
  });

  it("leaves a job to the file it works on where the project has one, or New makes none", () => {
    const kinds = (...names: ReadonlyArray<string>) => new Set(names);
    expect(toolboxStart(job("board-check"), kinds("Part", "Schematic"))).toBeNull();
    expect(toolboxStart(job("fit"), kinds("Assembly"))).toBeNull();
    expect(toolboxStart(job("write-up"), kinds())).toBeNull();
  });

  it("says so under a tab none of whose jobs fit the file", () => {
    expect(toolboxLeftOut(group("Check"), "Part")).toBeNull();
    expect(toolboxLeftOut(group("Make"), "CAM job")).toBeNull();
    expect(toolboxLeftOut(group("Design"), "CAM job")).toBe(
      "None of these work on this CAM job. Pause on one to see what it works on.",
    );
    expect(toolboxLeftOut(group("Make"), "Schematic")).toBe(
      "None of these work on this schematic. Pause on one to see what it works on.",
    );
    // Write up the results works on any file.
    expect(toolboxLeftOut(group("Document"), "Document")).toBeNull();
  });
});

describe("worksOnWords", () => {
  it("says what a job takes in as a sentence starts it", () => {
    expect(worksOnWords({ kinds: ["Part", "Assembly"] })).toBe("A part or an assembly");
    expect(worksOnWords({ kinds: ["FEA study"] })).toBe("An FEA study");
    expect(worksOnWords({ kinds: null })).toBe("Any file");
  });
});
