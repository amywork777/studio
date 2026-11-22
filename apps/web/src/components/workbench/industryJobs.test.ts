import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS, hardwareActions, TOOLBOX_ACTIONS } from "./hardwareActions";
import { INDUSTRIES } from "./industries";
import { INDUSTRY_ACTIONS } from "./industryJobs";
import { MENU_ICONS } from "./kinds";
import { toolIcon } from "./toolIcons";
import { toolUsed, withToolLine } from "./toolUsed";

const titles = (group: string, kind: string, skills: string[], process?: string) =>
  hardwareActions(kind, new Set(skills), process)
    .find((menu) => menu.group === group)
    ?.sections.map((section) => [section.title, section.actions.map((action) => action.label)]);

describe("an industry's jobs in the Toolbox", () => {
  it("offers them only while its plugin's skill is on", () => {
    const off = hardwareActions("Assembly", new Set(["cad"])).flatMap((menu) =>
      [...menu.sections, ...menu.others].map((section) => section.title),
    );
    expect(off).not.toContain("Woodworking");
    expect(titles("Evaluate", "Assembly", ["cad", "woodworking"])?.[0]).toEqual([
      "Woodworking",
      ["Check the cut list"],
    ]);
  });

  it("leads a group with them, after the project's own way of making it", () => {
    const sections = titles("Manufacture", "Part", ["cad", "cam", "woodworking"], "CNC machining");
    expect(sections?.[0]?.[0]).toBe("Machining and molding");
    expect(sections?.[1]).toEqual(["Woodworking", ["Cut list", "Sheet layout"]]);
  });

  it("offers a job only on what it works on", () => {
    // A piece of an upper is flattened from a mesh; a sole is a solid.
    expect(titles("Manufacture", "Mesh", ["footwear"])?.[0]).toEqual([
      "Footwear",
      ["Flatten an upper piece"],
    ]);
    expect(titles("Manufacture", "Part", ["footwear"])?.[0]).toEqual([
      "Footwear",
      ["Check the midsole for printing"],
    ]);
  });

  it("gives every industry plugin a job, and no job to anything else", () => {
    const packs = INDUSTRIES.filter((industry) => industry.plugin !== null);
    expect(
      packs.filter((pack) => !INDUSTRY_ACTIONS.some((job) => job.skill === pack.skill)),
    ).toEqual([]);
    expect(
      INDUSTRY_ACTIONS.filter((job) => !packs.some((pack) => pack.skill === job.skill)),
    ).toEqual([]);
  });

  it("names each job once among all the Toolbox's, by id and by label", () => {
    // A chat names the tool it came from by its label (`toolUsed`), so no two share one.
    for (const key of ["id", "label"] as const) {
      const names = TOOLBOX_ACTIONS.map((job) => job[key]);
      expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    }
    expect(TOOLBOX_ACTIONS).toHaveLength(HARDWARE_ACTIONS.length + INDUSTRY_ACTIONS.length);
  });

  it("says what each makes in a sentence its tile can hold, with a picture of its own", () => {
    const unsaid = INDUSTRY_ACTIONS.filter(
      (job) => !/^\S.*\.$/.test(job.gets) || job.gets.length > 100,
    );
    expect(unsaid.map((job) => `${job.id}: ${job.gets.length}`)).toEqual([]);
    const plain = INDUSTRY_ACTIONS.filter((job) => toolIcon(job) === MENU_ICONS[job.group]);
    expect(plain.map((job) => job.id)).toEqual([]);
    for (const group of new Set(INDUSTRY_ACTIONS.map((job) => job.group))) {
      const icons = TOOLBOX_ACTIONS.filter((job) => job.group === group).map(toolIcon);
      expect(new Set(icons).size, group).toBe(icons.length);
    }
  });

  it("shows the tool a chat came from", () => {
    const dieline = INDUSTRY_ACTIONS.find((job) => job.id === "dieline")!;
    const used = toolUsed(withToolLine(dieline.label, dieline.prompt("cartons/tuck.step")));
    expect(used?.tools).toEqual([dieline]);
  });
});
