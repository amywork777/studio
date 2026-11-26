import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS, hardwareActions } from "./hardwareActions";
import {
  featuredJobs,
  jobCount,
  pairLoneSections,
  pinnedJobs,
  readToolboxTab,
  searchJobs,
  suggestedJobs,
  toolboxGroups,
  toolboxStart,
  toolboxLeftOut,
  toolboxLibraryLink,
  toolboxWorksOn,
  uncheckedDrawing,
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
  it("always gives the three groups in order, empty when nothing applies", () => {
    const groups = toolboxGroups([]);
    expect(groups.map((group) => group.group)).toEqual(["Evaluate", "Manufacture", "Document"]);
    expect(groups.every((group) => group.sections.length === 0)).toBe(true);
  });

  it("lists the everyday sections first and the menus' others after, nothing folded", () => {
    const [evaluate, manufacture] = toolboxGroups(menus());
    expect(evaluate?.sections[0]?.title).toBe("Simulation");
    expect(manufacture?.sections[0]?.title).toBe("Machining and molding");
    expect(manufacture?.sections.map((section) => section.title)).toContain("3D printing");
    expect(Object.keys(manufacture?.sections[0] ?? {}).toSorted()).toEqual(["actions", "title"]);
  });

  it("lists every job exactly once", () => {
    const fromMenus = menus().flatMap((menu) =>
      [...menu.sections, ...menu.others].flatMap((section) => section.actions.map((a) => a.id)),
    );
    const fromGroups = toolboxGroups(menus()).flatMap((group) =>
      group.sections.flatMap((section) => section.actions.map((a) => a.id)),
    );
    expect(fromGroups.toSorted()).toEqual(fromMenus.toSorted());
    expect(new Set(fromGroups).size).toBe(fromGroups.length);
  });
});

describe("the Toolbox tab", () => {
  it("opens on the tab left open on this device, else Yours, pinned or not", () => {
    globalThis.localStorage?.removeItem("studio:toolbox-tab");
    expect(readToolboxTab()).toBe("Yours");
    writeToolboxTab("Document");
    expect(readToolboxTab()).toBe(globalThis.localStorage ? "Document" : "Yours");
    globalThis.localStorage?.setItem("studio:toolbox-tab", "Nonsense");
    expect(readToolboxTab()).toBe("Yours");
  });
});

describe("the Yours tab and search", () => {
  const groups = toolboxGroups(
    hardwareActions(null, new Set(["fea", "cad", "cam", "fdm", "sheet-metal"]), "FDM printing"),
  );
  const jobs = groups.flatMap((group) => group.sections.flatMap((section) => section.actions));
  const [first, second] = jobs;

  it("keeps pins in the order pinned and drops ones no skill can do now", () => {
    expect(pinnedJobs(groups, [second!.id, "gone", first!.id]).map((job) => job.id)).toEqual([
      second!.id,
      first!.id,
    ]);
  });

  it("suggests jobs made for the kind, across groups, leaving out pins and any-file jobs", () => {
    const suggested = suggestedJobs(groups, "Part", [], 6);
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.every((job) => job.kinds?.includes("Part"))).toBe(true);
    expect(new Set(suggested.map((job) => job.group)).size).toBeGreaterThan(1);
    const pinned = suggested[0]!.id;
    expect(suggestedJobs(groups, "Part", [pinned], 6).map((job) => job.id)).not.toContain(pinned);
    expect(suggestedJobs(groups, null, [])).toEqual([]);
  });

  it("finds a job by every word typed, in any case", () => {
    const found = searchJobs(groups, "FDM check");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((job) => /fdm/i.test(`${job.label} ${job.gets}`))).toBe(true);
    expect(searchJobs(groups, "  ")).toEqual([]);
    expect(searchJobs(groups, "zzz-nothing")).toEqual([]);
  });
});

describe("jobCount", () => {
  it("counts a group's jobs in all its sections", () => {
    const [evaluate] = toolboxGroups(menus());
    const all = evaluate?.sections.flatMap((section) => section.actions) ?? [];
    expect(evaluate && jobCount(evaluate)).toBe(all.length);
    expect(all.length).toBeGreaterThan(0);
    expect(toolboxGroups([]).map(jobCount)).toEqual([0, 0, 0]);
  });
});

describe("toolboxLibraryLink", () => {
  it("opens the Library on the group, coming back here while the workspace can take a request", () => {
    expect(
      toolboxLibraryLink("Evaluate", { workspaceOpen: true, from: "/chat/t1" }).search,
    ).toEqual({
      group: "Evaluate",
      from: "/chat/t1",
    });
  });

  it("leaves out where to come back to when no workspace is open", () => {
    expect(toolboxLibraryLink("Document", { workspaceOpen: false, from: "/chat/t1" })).toEqual({
      to: "/library",
      search: { group: "Document" },
    });
  });
});

describe("the Toolbox, whatever file is in front", () => {
  const SKILLS = new Set(["fea", "cad", "cam", "sendcutsend", "pcb"]);
  const groups = toolboxGroups(hardwareActions(null, SKILLS));
  const group = (name: (typeof groups)[number]["group"]) =>
    groups.find((entry) => entry.group === name)!;
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
      "Works on a part or a CAM job. Open one to use it.",
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

  it("says so under a group none of whose jobs fit the file", () => {
    expect(toolboxLeftOut(group("Evaluate"), "Part")).toBeNull();
    expect(toolboxLeftOut(group("Manufacture"), "CAM job")).toBeNull();
    expect(toolboxLeftOut(group("Evaluate"), "CAM job")).toBe(
      "None of these work on this CAM job. Pause on one to see what it works on.",
    );
    expect(toolboxLeftOut(group("Manufacture"), "Schematic")).toBe(
      "None of these work on this schematic. Pause on one to see what it works on.",
    );
    // Write up the results works on any file.
    expect(toolboxLeftOut(group("Document"), "Document")).toBeNull();
  });
});

describe("the home's Featured row", () => {
  const groups = toolboxGroups(
    hardwareActions(
      null,
      new Set(["fea", "cad", "engineering-drawing", "render", "drawing-check"]),
      "CNC machining",
    ),
  );
  const ids = (kind: string | null, drawing: string | null) =>
    featuredJobs(groups, kind, { uncheckedDrawing: drawing }).map((entry) => entry.job.id);

  it("leads with Drawing check, saying why, when a drawing in References is not checked yet", () => {
    const [first] = featuredJobs(groups, "Part", { uncheckedDrawing: "bracket.pdf" });
    expect(first?.job.id).toBe("drawing-check");
    expect(first?.reason).toContain("bracket.pdf");
    expect(ids("Part", "bracket.pdf")).toEqual(["drawing-check", "strength", "drawing"]);
  });

  it("shows only jobs that fit the file in front, and none with nothing open", () => {
    // Fit and clearance works on an assembly, so a part never features it.
    const all = (kind: string) =>
      featuredJobs(groups, kind, { uncheckedDrawing: null }, 9).map((entry) => entry.job.id);
    expect(all("Part")).not.toContain("fit");
    expect(all("Assembly")).toContain("fit");
    expect(ids(null, "bracket.pdf")).toEqual([]);
  });

  it("finds an unchecked drawing among References, not its drawn pages", () => {
    const paths = ["parts/a.py", "brief/references/a-pages/page-01.png", "brief/references/a.pdf"];
    expect(uncheckedDrawing(paths, false)).toBe("a.pdf");
    expect(uncheckedDrawing(paths, true)).toBeNull();
    expect(uncheckedDrawing(["docs/a.pdf"], false)).toBeNull();
  });
});
