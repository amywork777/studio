import { describe, expect, it } from "vite-plus/test";

import { hardwareActions } from "./hardwareActions";
import {
  jobCount,
  pairLoneSections,
  readToolboxTab,
  toolboxFolded,
  toolboxNarrowRem,
  toolboxGroups,
  toolboxLeftOut,
  toolboxLibraryLink,
  toolboxShownGroup,
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

describe("toolboxFolded", () => {
  it("keeps the choice made on this device on a wide panel", () => {
    expect(toolboxFolded({ chosen: false, narrow: false, openedNarrow: false })).toBe(false);
    expect(toolboxFolded({ chosen: true, narrow: false, openedNarrow: true })).toBe(true);
  });

  it("folds on a narrow panel until it is opened there", () => {
    expect(toolboxFolded({ chosen: false, narrow: true, openedNarrow: false })).toBe(true);
    expect(toolboxFolded({ chosen: true, narrow: true, openedNarrow: true })).toBe(false);
  });
});

describe("toolboxNarrowRem", () => {
  it("folds beside a chat in CAD and stays out across the window, and in AI down to a small panel", () => {
    const narrow = (simple: boolean, width: number) => width < toolboxNarrowRem(simple) * 16;
    expect(narrow(false, 1270)).toBe(true);
    expect(narrow(false, 1800)).toBe(false);
    expect(narrow(true, 1270)).toBe(false);
    expect(narrow(true, 600)).toBe(true);
  });
});

describe("the Toolbox tab", () => {
  it("opens on the group left open on this device, else Evaluate", () => {
    globalThis.localStorage?.removeItem("studio:toolbox-tab");
    expect(readToolboxTab()).toBe("Evaluate");
    writeToolboxTab("Document");
    expect(readToolboxTab()).toBe(globalThis.localStorage ? "Document" : "Evaluate");
    globalThis.localStorage?.setItem("studio:toolbox-tab", "Nonsense");
    expect(readToolboxTab()).toBe("Evaluate");
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

describe("the Toolbox on a file that is not a part", () => {
  const SKILLS = new Set(["fea", "cad", "cam", "sendcutsend"]);
  const groupsFor = (kind: string) => toolboxGroups(hardwareActions(kind, SKILLS));
  const labels = (kind: string, tab: Parameters<typeof toolboxShownGroup>[1]) =>
    toolboxShownGroup(groupsFor(kind), tab)?.sections.flatMap((section) =>
      section.actions.map((action) => action.label),
    );

  it("stays on the group left open where it has jobs", () => {
    expect(toolboxShownGroup(groupsFor("Part"), "Manufacture")?.group).toBe("Manufacture");
    expect(labels("CAM job", "Manufacture")).toEqual(["G-code for CNC"]);
  });

  it("opens on a group with jobs where the one left open has none for this kind", () => {
    expect(toolboxShownGroup(groupsFor("CAM job"), "Evaluate")?.group).toBe("Manufacture");
    // A study's result, however it is named: its jobs are the study's, not a mesh's to print.
    expect(toolboxShownGroup(groupsFor("Result"), "Manufacture")?.group).toBe("Evaluate");
    expect(labels("Drawing", "Evaluate")).toEqual(["Flat pattern DXF", "Check for SendCutSend"]);
    expect(labels("Document", "Manufacture")).toEqual(["Write up the results"]);
  });

  it("says what is left out, and what to open for it", () => {
    expect(toolboxLeftOut(groupsFor("Part"), "Part")).toBeNull();
    expect(toolboxLeftOut(groupsFor("CAM job"), "CAM job")).toBe(
      "No Analysis jobs for this CAM job. Open a part to see them.",
    );
    expect(toolboxLeftOut(groupsFor("Drawing"), "Drawing")).toBe(
      "No Analysis jobs for this drawing. Open a part to see them.",
    );
    expect(toolboxLeftOut(groupsFor("Document"), "Document")).toBe(
      "No Analysis or Manufacturing jobs for this document. Open a part to see them.",
    );
  });
});
