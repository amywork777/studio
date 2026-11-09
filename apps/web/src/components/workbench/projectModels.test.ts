import { describe, expect, it } from "vite-plus/test";

import { overviewParts, resultsFor } from "./checkResults";
import { leadPartOf } from "./leadPart";
import { projectFileItems } from "./projectItems";
import {
  folderFiles,
  modelProjectFile,
  pictureVersions,
  type ProjectModel,
  readFolderModels,
} from "./projectModels";
import { folderParts } from "./quickFind";
import { projectStarters } from "./starterJobs";
import { projectCover } from "./useProjectCover";

const PLATE = "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90";
const RIG = "6f1d0a2b-3c4d-5e6f-8a9b-0c1d2e3f4a5b";

/** `/api/v1/local/models?root=/p/bracket` as the CAD service answers it (`cad_server/viewer/folder_models.py`). */
const reply = {
  models: [
    { id: RIG, name: "rig", script: "assemblies/rig.py", kind: "assembly", updated: 1_761_555_700 },
    {
      id: PLATE,
      name: "mounting_plate",
      script: "parts/mounting_plate.py",
      kind: "part",
      updated: 1_761_555_600.25,
    },
  ],
};

describe("a project's models", () => {
  it("are read as the CAD service lists them, a part or an assembly as their build counted", () => {
    expect(readFolderModels(reply)).toEqual<ProjectModel[]>([
      {
        id: RIG,
        name: "rig",
        script: "assemblies/rig.py",
        kind: "Assembly",
        updated: "1761555700",
      },
      {
        id: PLATE,
        name: "mounting_plate",
        script: "parts/mounting_plate.py",
        kind: "Part",
        updated: "1761555600.25",
      },
    ]);
    expect(readFolderModels(null)).toEqual([]);
    expect(readFolderModels({ error: "the engine is not running" })).toEqual([]);
  });

  it("are listed as parts by their document id, named as the engine names them", () => {
    const file = modelProjectFile(readFolderModels(reply)[1]!);
    expect(file).toEqual({
      path: PLATE,
      name: "mounting_plate.py",
      title: "Mounting plate",
      folder: "parts",
      group: "CAD",
      kind: "Part",
      document: PLATE,
      script: "parts/mounting_plate.py",
      model: "mounting_plate",
      version: "1761555600.25",
    });
    expect(pictureVersions([file])).toEqual({ [PLATE]: "1761555600.25" });
  });

  it("stand where their scripts are among a folder's files, and after them where not listed", () => {
    const models = readFolderModels(reply);
    expect(
      folderFiles(["notes.md", "parts/mounting_plate.py", "README.md"], models).map(
        (file) => file.path,
      ),
    ).toEqual(["notes.md", PLATE, "README.md", RIG]);
  });

  it("lead the project and its list, with a STEP exported beside one folded into it", () => {
    const models = readFolderModels(reply).filter((model) => model.id === PLATE);
    const folder = {
      root: "/p/bracket",
      paths: ["parts/mounting_plate.py", "parts/mounting_plate.step", "README.md"],
      models,
    };
    expect(leadPartOf([folder])?.file.path).toBe(PLATE);
    expect(projectFileItems([folder]).map((item) => [item.file.path, item.label])).toEqual([
      [PLATE, "Mounting plate"],
    ]);
    expect(overviewParts(folderFiles(folder.paths, models)).map((part) => part.path)).toEqual([
      PLATE,
    ]);
  });

  it("give a project with only models a picture, versions, ⌘K's parts and a new chat's starters", () => {
    const models = readFolderModels(reply);
    const paths = ["parts/mounting_plate.py", "assemblies/rig.py", "README.md"];
    // Home's tile and the switcher's picture: the whole product, the assembly. Version history is
    // offered while a project has something to picture.
    expect(projectCover(paths, models)).toBe(RIG);
    expect(projectCover(paths, [])).toBeNull();
    // ⌘K finds each part by the name the engine gives it.
    expect(
      folderParts([{ project: "bracket", root: "/p/bracket", paths, models }]).map(
        (found) => found.file.title,
      ),
    ).toEqual(["Mounting plate", "Rig"]);
    // A new chat starts from them.
    const starters = projectStarters(folderFiles(paths, models), new Set(["fea", "cad"]), null);
    expect(starters.length).toBeGreaterThan(0);
    expect(starters.some((starter) => /mounting plate|rig/i.test(starter.label))).toBe(true);
  });

  it("take the checks cadgen 0.8 names them by, their document id", () => {
    const part = modelProjectFile(readFolderModels(reply)[1]!);
    const result = (named: string) => ({
      path: `FEA/${named}.fea.json`,
      model: `FEA/${named}.fea.glb`,
      part: named,
      check: "Strength",
      status: "ready" as const,
      headline: "Holds",
      issues: [],
    });
    expect(
      resultsFor(part, [result(PLATE), result(RIG), result("mounting_plate")]).map((r) => r.part),
    ).toEqual([PLATE, "mounting_plate"]);
  });
});
