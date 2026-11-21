import type { StudioSample } from "@t3tools/contracts";
import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import { newProjectBrief } from "../newProjectBrief";

import {
  copyBrief,
  copyName,
  findExamples,
  listExamples,
  sampleFile,
  validateExampleSearch,
} from "./examples";

const sample = (id: string, name: string, open = "parts/part.step"): StudioSample => ({
  id,
  name,
  purpose: `${name}, an example.`,
  shows: ["Drawing"],
  picture: "pictures/angle.png",
  open,
  path: `/studio/sample/${id}`,
});

describe("copyName", () => {
  it("names the first copy as the example", () => {
    expect(copyName("Phone stand", ["Desk lamp"])).toBe("Phone stand");
  });

  it("names a second copy past the first, never the same name again", () => {
    expect(copyName("Phone stand", ["Phone stand"])).toBe("Phone stand 2");
    expect(copyName("Phone stand", ["phone stand", "Phone stand 2", "Phone Stand 3 "])).toBe(
      "Phone stand 4",
    );
  });

  it("fills the first number free", () => {
    expect(copyName("Phone stand", ["Phone stand", "Phone stand 3"])).toBe("Phone stand 2");
  });
});

describe("sampleFile", () => {
  it("keeps a path inside the sample's folder", () => {
    expect(sampleFile("parts/servo_bracket.step")).toBe("parts/servo_bracket.step");
    expect(sampleFile("./drawings\\bracket.pdf")).toBe("drawings/bracket.pdf");
  });

  it("refuses a path that leaves the folder, or none at all", () => {
    expect(sampleFile("../secrets.txt")).toBeNull();
    expect(sampleFile("parts/../../x.step")).toBeNull();
    expect(sampleFile("/etc/passwd")).toBeNull();
    expect(sampleFile("\\\\server\\share\\x")).toBeNull();
    expect(sampleFile("C:\\Users\\x.step")).toBeNull();
    expect(sampleFile("C:foo")).toBeNull();
    expect(sampleFile("")).toBeNull();
    expect(sampleFile("parts/")).toBeNull();
  });
});

describe("listExamples", () => {
  it("lists the examples by name", () => {
    const listed = listExamples([
      sample("shelf-bracket", "Shelf bracket"),
      sample("desk-lamp", "Desk lamp"),
      sample("phone-stand", "Phone stand"),
    ]);
    expect(listed.map((entry) => entry.id)).toEqual(["desk-lamp", "phone-stand", "shelf-bracket"]);
  });

  it("lists none where the server ships none", () => {
    expect(listExamples(undefined)).toEqual([]);
  });

  it("keeps the first of two with one id", () => {
    const listed = listExamples([sample("lamp", "Desk lamp"), sample("lamp", "Floor lamp")]);
    expect(listed.map((entry) => entry.name)).toEqual(["Desk lamp"]);
  });

  it("leaves out an example whose main file is outside its folder", () => {
    const listed = listExamples([
      sample("phone-stand", "Phone stand"),
      sample("sneaky", "Sneaky", "../../elsewhere/part.step"),
    ]);
    expect(listed.map((entry) => entry.id)).toEqual(["phone-stand"]);
  });

  it("opens an example on its main file as written inside its folder", () => {
    const [listed] = listExamples([sample("phone-stand", "Phone stand", "./parts\\stand.step")]);
    expect(listed?.open).toBe("parts/stand.step");
  });
});

describe("validateExampleSearch", () => {
  it("keeps the file a copy opens on only while it is inside the example", () => {
    expect(validateExampleSearch({ file: "drawings/bracket.pdf" })).toEqual({
      file: "drawings/bracket.pdf",
    });
    expect(validateExampleSearch({ file: "../../.ssh/id_rsa" })).toEqual({});
    expect(validateExampleSearch({ file: 3 })).toEqual({});
    expect(validateExampleSearch({})).toEqual({});
  });
});

describe("copyBrief", () => {
  const part = STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!;
  const briefOf = (example: StudioSample) =>
    newProjectBrief({
      kind: part,
      units: "mm",
      standard: "ISO",
      generalTolerance: "",
      ...copyBrief(example),
    });

  it("makes a copy's brief carry the example's process, material and purpose", () => {
    const brief = briefOf({
      ...sample("motor-mount", "Motor mount plate"),
      process: "CNC machining",
      material: "Aluminium 6061-T6, 10 mm plate",
    });
    expect(brief).toMatchObject({
      process: "CNC machining",
      material: "Aluminium 6061-T6, 10 mm plate",
      purpose: "Motor mount plate, an example.",
    });
  });

  it("leaves the material empty and the kind's process when the example names none", () => {
    const brief = briefOf(sample("old", "Old example"));
    expect(brief.material).toBe("");
    expect(brief.process).toBe(part.process);
  });
});

describe("findExamples", () => {
  const examples = [sample("stand", "Phone stand"), sample("lamp", "Desk lamp")];

  it("narrows the Library's examples by name and by what they show", () => {
    expect(findExamples(examples, "lamp").map((entry) => entry.id)).toEqual(["lamp"]);
    expect(findExamples(examples, "drawing")).toHaveLength(2);
  });

  it("keeps every example for an empty search, and none for a stranger", () => {
    expect(findExamples(examples, "")).toHaveLength(2);
    expect(findExamples(examples, "turbine")).toEqual([]);
  });
});
