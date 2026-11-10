import { describe, expect, it } from "vite-plus/test";

import { DOCUMENT_TEMPLATES, NEW_TEMPLATES } from "./newTemplates";
import { newProjectName, projectKindFor } from "./useStartProject";

const template = (id: string) => NEW_TEMPLATES.find((entry) => entry.id === id)!;
const document = (id: string) => DOCUMENT_TEMPLATES.find((entry) => entry.id === id)!;

describe("a project started from New on Home", () => {
  it("is named by the name given in New, else as new work of its kind", () => {
    expect(newProjectName({ template: template("part"), name: "servo_bracket" })).toBe(
      "Servo bracket",
    );
    expect(newProjectName({ template: template("part"), name: "Part" })).toBe("New part");
    expect(newProjectName({ template: template("assembly"), name: " " })).toBe("New assembly");
    expect(newProjectName({ template: document("fmea"), name: "FMEA" })).toBe("New FMEA");
    expect(newProjectName({ template: document("prd"), name: "PRD" })).toBe(
      "New product requirements (PRD)",
    );
  });
});

describe("the kind of project New starts", () => {
  it("reaches every kind New has work for: part, product, circuit board and robot", () => {
    expect(projectKindFor("part").id).toBe("part");
    expect(projectKindFor("sheet-metal").id).toBe("part");
    expect(projectKindFor("assembly").id).toBe("product");
    expect(projectKindFor("board").id).toBe("board");
    expect(projectKindFor("robot").id).toBe("robot");
    expect(projectKindFor("prd").id).toBe("part");
  });

  it("offers the robot description in a new project, so a robot project can be started", () => {
    expect(template("robot").source).toBe("new");
  });
});
