import { describe, expect, it } from "vite-plus/test";

import type { CheckResult } from "./checkResults";
import { deliverablesPlan, type PackagePart } from "./deliverables";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";

const file = (path: string, extra: Partial<ProjectFile> = {}): ProjectFile => ({
  ...classifyProjectFile(path)!,
  ...extra,
});

const strength: CheckResult = {
  path: "studies/bracket/result.json",
  model: "studies/bracket/result.glb",
  part: "bracket.step",
  check: "Strength",
  status: "ready",
  headline: "Safety factor 3.2",
  issues: [],
  written: Date.UTC(2026, 10, 25, 9, 0) / 1000,
};

const drawingCheck: CheckResult = {
  path: "checks/bracket.drawing-check.json",
  model: "checks/bracket.drawing-check.json",
  part: "bracket",
  check: "Drawing check",
  status: "fix",
  headline: "1 out · 11 within",
  issues: [
    {
      severity: "error",
      summary: "Hole spacing: 52.40 on the model, 52 ±0.1 on the drawing",
      detail: null,
    },
  ],
};

const now = new Date(2026, 10, 25, 14, 5);

describe("deliverablesPlan", () => {
  it("exports each part, copies what the project has and lists what it has not", () => {
    const parts: PackagePart[] = [
      {
        root: "/p",
        file: file("parts/bracket.step", { version: String(Date.UTC(2026, 10, 25, 8) / 1000) }),
        results: [strength, drawingCheck],
        outdated: [],
        drawings: ["drawings/bracket_drawing.pdf"],
      },
      // A cadgen model by its document id, built from its script.
      {
        root: "/p",
        file: file("parts/clip.step", { document: "model:clip", script: "parts/clip.py" }),
        results: [],
        outdated: [{ ...strength, part: "clip.step" }],
        drawings: [],
      },
    ];
    const plan = deliverablesPlan({
      name: "Servo mount",
      cwd: "/p",
      folders: [
        {
          root: "/p",
          paths: [
            "parts/bracket.step",
            "parts/bracket.stl",
            "docs/servo_mount_parts_list.md",
            "pictures/servo_mount_angle.png",
            "brief/references/sketch.png",
            "brief/references/drawing-pages/page-01.png",
            "deliverables/Servo mount deliverables 2026-11-24/renders/old.png",
          ],
        },
      ],
      parts,
      now,
    });
    expect(plan.name).toBe("Servo mount deliverables 2026-11-25");
    expect(plan.exports).toEqual([
      { source: "parts/bracket.step", stem: "bracket", formats: ["stl"] },
      { source: "model:clip", stem: "clip", formats: ["step", "stl"] },
    ]);
    expect(plan.copies.map((copy) => copy.to)).toEqual([
      "models/bracket.step",
      "drawings/bracket_drawing.pdf",
      "parts-list/servo_mount_parts_list.md",
      "renders/servo_mount_angle.png",
    ]);
    expect(plan.missing).toEqual(["Build guide: none made yet (Toolbox, Assembly instructions)"]);

    expect(plan.receipt).toContain("- Strength: Passed. Safety factor 3.2 (run ");
    expect(plan.receipt).toContain("- Drawing check: Failed. 1 out · 11 within");
    expect(plan.receipt).toContain(
      "  - Failed: Hole spacing: 52.40 on the model, 52 ±0.1 on the drawing",
    );
    // The clip changed since its check, and nobody checked it against a drawing: neither passes.
    expect(plan.receipt).toContain(
      "- Strength: part changed since this check, so it counts as not checked",
    );
    expect(plan.receipt).toContain("- Strength and other checks: not checked");
    expect(plan.receipt.match(/- Drawing check: not checked/g)).toHaveLength(1);
    expect(plan.receipt).not.toContain("## Not checked");
  });

  it("lists parts no check has run on together, and leaves out a mesh of a part it exports", () => {
    const plan = deliverablesPlan({
      name: "Rig",
      cwd: "/a",
      folders: [],
      parts: [
        { root: "/a", file: file("arm.step"), results: [], outdated: [], drawings: [] },
        { root: "/a", file: file("arm.stl"), results: [], outdated: [], drawings: [] },
        { root: "/a", file: file("robots/arm.urdf"), results: [], outdated: [], drawings: [] },
      ],
      now,
    });
    expect(plan.exports).toEqual([{ source: "arm.step", stem: "arm", formats: ["stl"] }]);
    expect(plan.copies.map((copy) => copy.to)).toEqual(["models/arm.step"]);
    expect(plan.receipt).toContain("## Not checked");
    expect(plan.receipt).toContain(
      "- Arm (arm.step): a file as it came, not built by Studio's CAD tools",
    );
    expect(plan.receipt).not.toContain("###");
  });

  it("copies a second folder's parts as they are, since its exports cannot go in the first", () => {
    const plan = deliverablesPlan({
      name: "Rig",
      cwd: "/a",
      folders: [],
      parts: [{ root: "/b", file: file("arm.step"), results: [], outdated: [], drawings: [] }],
      now,
    });
    expect(plan.exports).toEqual([]);
    expect(plan.copies).toEqual([{ root: "/b", path: "arm.step", to: "models/arm.step" }]);
  });
});
