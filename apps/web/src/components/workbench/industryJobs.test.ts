import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS, hardwareActions, TOOLBOX_ACTIONS } from "./hardwareActions";
import { INDUSTRIES } from "./industries";
import { INDUSTRY_ACTIONS } from "./industryJobs";
import { MENU_ICONS } from "./kinds";
import { toolIcon } from "./toolIcons";
import { toolUsed, withToolLine } from "./toolUsed";

const titles = (
  group: string,
  kind: string,
  skills: string[],
  process?: string,
  industry?: string,
  part: "sections" | "others" = "sections",
) =>
  hardwareActions(kind, new Set(skills), process, industry)
    .find((menu) => menu.group === group)
    ?.[part].map((section) => [section.title, section.actions.map((action) => action.label)]);

const named = (sections: ReturnType<typeof titles>) => sections?.map(([title]) => title) ?? [];

describe("an industry's jobs in the Toolbox", () => {
  it("offers them only while its plugin's skill is on", () => {
    const off = hardwareActions("Assembly", new Set(["cad"]), undefined, "woodworking").flatMap(
      (menu) => [...menu.sections, ...menu.others].map((section) => section.title),
    );
    expect(off).not.toContain("Woodworking");
    expect(
      titles("Evaluate", "Assembly", ["cad", "woodworking"], undefined, "woodworking")?.[0],
    ).toEqual(["Woodworking", ["Check the cut list"]]);
  });

  it("leads its own projects' groups, before their way of making it, and keeps out of others'", () => {
    const skills = ["cad", "cam", "woodworking", "packaging"];
    const ours = titles("Manufacture", "Part", skills, "CNC machining", "woodworking");
    expect(ours?.[0]).toEqual(["Woodworking", ["Cut list", "Cutting diagrams"]]);
    expect(ours?.[1]?.[0]).toBe("Machining and molding");
    expect(named(ours)).not.toContain("Packaging");
    expect(
      named(titles("Manufacture", "Part", skills, "CNC machining", "woodworking", "others")),
    ).not.toContain("Packaging");
    // A project of no trade keeps every trade's jobs apart, for a request not told as one.
    const general = titles("Manufacture", "Part", skills, "CNC machining");
    expect(named(general)).not.toContain("Woodworking");
    expect(named(titles("Manufacture", "Part", skills, "CNC machining", "", "others"))).toEqual(
      expect.arrayContaining(["Woodworking", "Packaging"]),
    );
  });

  it("offers a job only on what it works on", () => {
    // A piece of an upper is flattened from a mesh; a sole is a solid.
    expect(titles("Manufacture", "Mesh", ["footwear"], undefined, "footwear")?.[0]).toEqual([
      "Footwear",
      ["Flatten an upper piece"],
    ]);
    expect(titles("Manufacture", "Part", ["footwear"], undefined, "footwear")?.[0]).toEqual([
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
