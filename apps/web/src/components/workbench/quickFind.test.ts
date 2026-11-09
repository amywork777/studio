import { describe, expect, it } from "vite-plus/test";

import { hardwareActions } from "./hardwareActions";
import {
  findFiles,
  findJobs,
  folderDocuments,
  folderOtherFiles,
  folderParts,
  holdsWords,
} from "./quickFind";

const SKILLS = new Set(["fea", "cad", "cam", "print3d"]);
const labels = (query: string, process?: string) =>
  findJobs(hardwareActions("Part", SKILLS, process), query).map(
    (job) => `${job.place}: ${job.action.label}`,
  );

describe("quick find", () => {
  it("matches every word typed, in any order and case", () => {
    expect(holdsWords("Buckling\nStrength and durability\nEvaluate", "evaluate BUCK")).toBe(true);
    expect(holdsWords("Buckling\nStrength and durability\nEvaluate", "buckling heat")).toBe(false);
    expect(holdsWords("anything", "  ")).toBe(true);
  });

  it("finds a job the menus leave out, by its name", () => {
    expect(labels("powder")).toEqual(["Manufacturing · 3D printing: Check for powder printing"]);
  });

  it("finds a whole section, or a menu's every job, by their names", () => {
    expect(labels("analysis simulation")).toEqual(["Analysis · Simulation: Strength under load"]);
    const manufacture = labels("manufacturing", "CNC machining");
    expect(manufacture[0]).toBe("Manufacturing · Machining and molding: Check for CNC machining");
    expect(manufacture).toContain("Manufacturing · 3D printing: Slice and print");
  });

  it("finds no job until something is typed", () => {
    expect(labels("")).toEqual([]);
  });

  it("lists each folder's parts as the Overview does, a design's STEP inside it", () => {
    const parts = folderParts([
      {
        project: "Bike hook",
        root: "/work/hook",
        paths: ["hook.solidcraft", "hook.step", "notes.md", "clip.stl"],
      },
      { project: "Lanyard", root: "/work/lanyard", paths: null },
    ]);
    expect(parts.map((part) => [part.project, part.file.path, part.file.picture])).toEqual([
      ["Bike hook", "hook.solidcraft", "hook.step"],
      ["Bike hook", "clip.stl", undefined],
    ]);
  });

  it("finds a file by its kind as well as its name, each thing once", () => {
    const found = (query: string) =>
      findFiles(
        folderOtherFiles([
          {
            project: "Motor mount",
            root: "/p/motor",
            paths: [
              "README.md",
              "motor_plate.step",
              "motor_plate.cam.glb",
              "motor_plate.cam.json",
              "motor_plate.dxf",
              "docs/prd.md",
            ],
          },
        ]),
        query,
        (project) => project,
      ).map(({ file }) => [file.title, file.kind, file.path]);
    expect(found("cam job")).toEqual([["Motor plate", "CAM job", "motor_plate.cam.glb"]]);
    expect(found("MOTOR drawing")).toEqual([["Motor plate", "Drawing", "motor_plate.dxf"]]);
    // Parts and documents are found as themselves.
    expect(found("part")).toEqual([]);
    expect(found("prd")).toEqual([]);
  });

  it("finds each folder's documents, leaving the README to the Overview", () => {
    expect(
      folderDocuments([
        {
          project: "roomba",
          root: "/p/roomba",
          paths: ["README.md", "docs/prd.md", "parts/bumper.step", "docs/fmea.csv"],
        },
        { project: "clip", root: "/p/clip", paths: null },
      ]).map(({ project, file }) => [project, file.title]),
    ).toEqual([
      ["roomba", "PRD"],
      ["roomba", "FMEA"],
    ]);
  });
});
