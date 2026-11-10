// @effect-diagnostics nodeBuiltinImport:off - reads the examples' own results in studio-sample/.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  checkOutOfDate,
  currentResults,
  drawingsFor,
  isCheckResultPath,
  claimStudies,
  isNamedStudyPath,
  manufacturingFor,
  overviewParts,
  parseCheckResult,
  proposeFixPrompt,
  resultsFor,
  studiesFor,
  worstStatus,
} from "./checkResults";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";

/** The examples Studio ships, each with the results of its own runs. */
const SAMPLES = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..", "studio-sample");

const casting = JSON.stringify({
  document: "/work/demo/bossbar.step",
  analysis: "casting",
  findings: [
    {
      check: "casting",
      severity: "info",
      type: "thinnest_section",
      summary: "The thinnest section is solid through at 20.8 s",
    },
    {
      check: "casting",
      severity: "warning",
      type: "low_niyama",
      summary: "Niyama falls to 0.044 near the boss",
      fix: { action: "add_feeder", summary: "Feed it from #o1.f7" },
    },
    {
      check: "casting",
      severity: "error",
      type: "shrinkage_hot_spot",
      summary: "An isolated hot spot in the boss freezes last.",
      fix: { action: "add_feeder", summary: "Feed it from #o1.f7: a riser of modulus 2.9 mm." },
    },
  ],
  verdict: { status: "fix", headline: "1 to fix · shrinkage hot spot", errors: 1, warnings: 1 },
});

// An FEA result from before verdicts: its status comes from its findings.
const fea = JSON.stringify({
  document: "field-test-asm/rover_mount.step",
  findings: [
    {
      check: "fea",
      severity: "warning",
      type: "low_margin",
      summary: "Safety factor 1.4 at the boss",
    },
  ],
});

const file = (path: string): ProjectFile => classifyProjectFile(path)!;

describe("check results", () => {
  it("reads FEA results, and nothing else", () => {
    expect(
      [
        "bossbar.casting.result.json",
        "out/mount.fea.json",
        "bossbar.casting.json",
        "bossbar.step",
        "package.json",
      ].map(isCheckResultPath),
    ).toEqual([false, true, false, false, false]);
  });

  it("names the part, the check, its verdict and its issues, errors first", () => {
    expect(parseCheckResult("out/bossbar.casting.result.json", casting)).toEqual({
      path: "out/bossbar.casting.result.json",
      model: "out/bossbar.casting.glb",
      part: "bossbar.step",
      check: "Casting",
      status: "fix",
      headline: "1 to fix · shrinkage hot spot",
      issues: [
        {
          severity: "error",
          summary: "An isolated hot spot in the boss freezes last.",
          fix: "Feed it from #o1.f7: a riser of modulus 2.9 mm.",
        },
        {
          severity: "warning",
          summary: "Niyama falls to 0.044 near the boss",
          fix: "Feed it from #o1.f7",
        },
      ],
    });
  });

  it("judges a result without a verdict by its findings", () => {
    const result = parseCheckResult("mount.fea.json", fea);
    expect(result).toMatchObject({
      model: "mount.fea.glb",
      part: "rover_mount.step",
      check: "Strength",
      status: "warnings",
      headline: "Safety factor 1.4 at the boss",
    });
    const passed = parseCheckResult(
      "plate.heat_treatment.result.json",
      JSON.stringify({ findings: [], verdict: { status: "ready", headline: "Ready to quench" } }),
    );
    expect(passed).toMatchObject({
      part: "plate",
      check: "Heat treatment",
      status: "ready",
      headline: "Ready to quench",
    });
  });

  it("skips a file that is not a result, or is still being written", () => {
    expect(parseCheckResult("a.result.json", '{"findings": [')).toBeNull();
    expect(parseCheckResult("a.result.json", '{"files": {}}')).toBeNull();
  });

  it("lists each part once, a mesh beside its STEP folded in, and finds its results", () => {
    const files = [
      "bossbar.step",
      "bossbar.stl",
      "lid.stl",
      "plate.step",
      "bossbar.casting.glb",
      "board/main.kicad_pcb",
    ].map(file);
    const parts = overviewParts(files);
    expect(parts.map((part) => part.path)).toEqual([
      "bossbar.step",
      "lid.stl",
      "plate.step",
      "board/main.kicad_pcb",
    ]);

    const results = [
      parseCheckResult("bossbar.casting.result.json", casting)!,
      parseCheckResult(
        "plate.heat_treatment.result.json",
        JSON.stringify({ findings: [], verdict: { status: "ready", headline: "Ready" } }),
      )!,
    ];
    expect(resultsFor(parts[0]!, results).map((result) => result.check)).toEqual(["Casting"]);
    expect(resultsFor(parts[2]!, results).map((result) => result.check)).toEqual([
      "Heat treatment",
    ]);
    expect(resultsFor(parts[1]!, results)).toEqual([]);
    expect(worstStatus(results)).toBe("fix");
    expect(worstStatus([])).toBeNull();
  });

  it("lists a SolidCraft design once, pictured by its STEP and checked through it", () => {
    const files = [
      "parts/plate.solidcraft",
      "parts/plate.step",
      "parts/plate.glb",
      "parts/arm.step",
    ]
      .map(classifyProjectFile)
      .filter((file): file is ProjectFile => file !== null);
    const parts = overviewParts(files);
    expect(parts.map((part) => [part.name, part.kind, part.picture])).toEqual([
      ["plate.solidcraft", "Design", "parts/plate.step"],
      ["arm.step", "Part", undefined],
    ]);
    const result = parseCheckResult(
      "parts/plate.fea.json",
      JSON.stringify({ document: "plate.step", findings: [] }),
    )!;
    expect(resultsFor(parts[0]!, [result])).toHaveLength(1);
    expect(resultsFor(parts[1]!, [result])).toHaveLength(0);
  });

  it("names an FEA study's check as the engineer says it, with its safety factor when it passes", () => {
    // As `cadgen fea solve` writes it: the check's label, the safety factor, and its picture.
    const passed = parseCheckResult(
      "FEA/bracket.bracket-load.json",
      JSON.stringify({
        generator: "cadgen fea",
        document: "bracket.step",
        study: { material: "aluminum-6061-t6" },
        summary: { safety_factor: 3.24, checks: [{ kind: "stress", label: "Strength" }] },
        files: { glb: "bracket.bracket-load.glb" },
        findings: [],
      }),
    );
    expect(passed).toMatchObject({
      model: "FEA/bracket.bracket-load.glb",
      part: "bracket.step",
      check: "Strength",
      status: "ready",
      headline: "Holds the load, safety factor 3.2",
    });
    const other = parseCheckResult(
      "plate.fea.json",
      JSON.stringify({ document: "plate.step", study: { analysis: "thermal" }, findings: [] }),
    );
    expect(other?.check).toBe("Thermal");
    // A named study is found beside its picture; a JSON with none is not a study.
    const folder = new Set([
      "FEA/bracket.bracket-load.json",
      "FEA/bracket.bracket-load.glb",
      "package.json",
      "data.v2.json",
    ]);
    expect([...folder].map((path) => isNamedStudyPath(path, folder))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("ties a study an agent ran on a copy back to the part", () => {
    const folder = new Set(["studies/stopped-panel-result.json", "studies/stopped-panel.glb"]);
    expect(isNamedStudyPath("studies/stopped-panel-result.json", folder)).toBe(true);
    const study = (name: string) =>
      parseCheckResult(
        `studies/${name}-result.json`,
        JSON.stringify({
          document: `studies/${name}.step`,
          glb: `studies/${name}.glb`,
          summary: { safety_factor: 1.33 },
          study: {},
          findings: [],
        }),
      )!;
    const stopped = study("stopped-panel");
    expect(stopped.model).toBe("studies/stopped-panel.glb");
    const model = (name: string) => ({
      ...classifyProjectFile(`parts/${name}.step`)!,
      name: `${name}.py`,
      document: `id-${name}`,
    });
    const exported = classifyProjectFile("parts/case-rev-b.step")!;

    // The only model takes it, whatever the copy is called; a STEP beside it is not a model.
    expect(claimStudies([model("case"), exported], [stopped])[0]?.part).toBe("id-case");
    // With several, it goes by name, and a copy that fits none stays unclaimed.
    const parts = [model("hinge"), model("panel")];
    expect(claimStudies(parts, [study("panel-tip")])[0]?.part).toBe("id-panel");
    expect(claimStudies(parts, [stopped])[0]?.part).toBe("stopped-panel.step");
    // A check on the part itself is left alone.
    const own = parseCheckResult(
      "plate.fea.json",
      JSON.stringify({ document: "parts/plate.step", findings: [] }),
    )!;
    expect(claimStudies(parts, [own])).toEqual([own]);
  });

  it("reads a strength check whose picture keeps the solver's .fea.glb name", () => {
    const folder = new Set(["studies/thumb.result.json", "studies/thumb.fea.glb"]);
    expect(isNamedStudyPath("studies/thumb.result.json", folder)).toBe(true);
    const result = parseCheckResult(
      "studies/thumb.result.json",
      JSON.stringify({
        ok: false,
        document: "parts/flexure_case.step",
        glb: "studies/thumb.fea.glb",
        summary: { safety_factor: 0.48 },
        study: { margin: 2 },
        findings: [{ check: "fea", severity: "error", summary: "It yields" }],
      }),
    )!;
    expect(result.model).toBe("studies/thumb.fea.glb");
    expect(result.part).toBe("flexure_case.step");
    expect(result.status).toBe("fix");
  });

  it("reads a strength check as an agent on text-to-cad 0.10 saves it, for the model it checked", () => {
    // `cad fea solve parts/bracket.step studies/tip-load.glb --study studies/tip-load.json --json`,
    // saved beside its picture; the STEP is exported from the model `parts/bracket.py` makes.
    const folder = new Set([
      "studies/tip-load.json",
      "studies/tip-load.result.json",
      "studies/tip-load.glb",
    ]);
    expect([...folder].map((path) => isNamedStudyPath(path, folder))).toEqual([true, true, false]);
    expect(
      parseCheckResult("studies/tip-load.json", JSON.stringify({ fixtures: [], loads: [] })),
    ).toBeNull();
    const result = parseCheckResult(
      "studies/tip-load.result.json",
      JSON.stringify({
        ok: true,
        document: "parts/bracket.step",
        glb: "studies/tip-load.glb",
        summary: { safety_factor: 1.868, checks: [{ kind: "stress", label: "Strength" }] },
        study: { margin: 2 },
        findings: [
          { check: "fea", severity: "warning", summary: "It holds, but only 1.8× the load" },
        ],
      }),
    )!;
    expect(result).toMatchObject({
      model: "studies/tip-load.glb",
      part: "bracket.step",
      check: "Strength",
      status: "warnings",
    });
    const model = (script: string): ProjectFile => ({
      path: "7dde5cd8-809d-5212-afd0-2a5e48278472",
      name: script.split("/").at(-1)!,
      title: "Bracket",
      folder: "parts",
      group: "CAD",
      kind: "Part",
      document: "7dde5cd8-809d-5212-afd0-2a5e48278472",
      script,
    });
    expect(resultsFor(model("parts/bracket.py"), [result])).toHaveLength(1);
    expect(resultsFor(model("parts/plate.py"), [result])).toHaveLength(0);
  });

  it("reads text-to-cad 0.11's study folder: its result.json, pictured by its result.glb", () => {
    // `cad step solve parts/bar.step --study studies/tip-load.json --out studies/tip-load --json`, as
    // the cantilever sample in text-to-cad's own tests writes it (cut to what is read here).
    const answer = (findings: unknown[], safety: number, path = "/work/bar/parts/bar.step") =>
      JSON.stringify({
        ok: true,
        path,
        findings,
        summary: `solved COMPOUND of bar.step: peak 29.3828 MPa, safety factor ${safety}`,
        measurements: {
          safety_factor: safety,
          checks: [{ kind: "stress", label: "Strength", status: "passes" }],
          study: { material: { name: "Aluminum 6061-T6" } },
        },
        written: [
          "/work/bar/studies/tip-load/result.json",
          "/work/bar/studies/tip-load/result.glb",
        ],
      });
    const folder = new Set(["studies/tip-load/result.json", "studies/tip-load/result.glb"]);
    expect([...folder].map(isCheckResultPath)).toEqual([true, false]);
    expect(isNamedStudyPath("studies/tip-load/result.json", folder)).toBe(true);
    const passed = parseCheckResult("studies/tip-load/result.json", answer([], 9.393))!;
    expect(passed).toMatchObject({
      model: "studies/tip-load/result.glb",
      part: "bar.step",
      check: "Strength",
      status: "ready",
      headline: "Holds the load, safety factor 9.4",
      issues: [],
    });
    expect(passed.onStudyCopy).toBeUndefined();
    expect(resultsFor(file("parts/bar.step"), [passed])).toHaveLength(1);
    // 0.11's findings say themselves in `message`, and what to do in `hint`.
    const weak = parseCheckResult(
      "studies/tip-load/result.json",
      answer(
        [
          {
            severity: "error",
            code: "yields",
            message: "The peak is above yield",
            location: "bar/face 3",
            hint: "Thicken the arm",
          },
        ],
        0.8,
      ),
    )!;
    expect(weak.status).toBe("fix");
    expect(weak.issues).toEqual([
      { severity: "error", summary: "The peak is above yield", fix: "Thicken the arm" },
    ]);
    // A model solved by its document id is that model's check; a copy in a study folder is a copy's.
    const id = "7dde5cd8-809d-5212-afd0-2a5e48278472";
    expect(parseCheckResult("FEA/result.json", answer([], 3, id))?.part).toBe(id);
    expect(
      parseCheckResult("studies/a/result.json", answer([], 3, "/w/studies/copy.step"))?.onStudyCopy,
    ).toBe(true);
  });

  it("keeps a note about the run out of the status and the headline, and in the result's list", () => {
    // text-to-cad's `solver_note` is about the run (a slow solve, a finer solve skipped), not the
    // part: the motor mount's plate, at a safety factor of 521, is a pass and reads as one.
    const answer = (findings: unknown[], safety: number) =>
      JSON.stringify({
        ok: true,
        path: "/work/motor-mount/parts/motor_plate.step",
        findings,
        measurements: {
          safety_factor: safety,
          checks: [{ kind: "stress", label: "Strength", status: "passes" }],
        },
      });
    const slow = {
      severity: "warning",
      code: "solver_note",
      message:
        "199236 degrees of freedom: expect a slow solve; a larger mesh.size_mm is usually enough",
      location: null,
      hint: null,
    };
    const passed = parseCheckResult("studies/motor_plate/result.json", answer([slow], 521.397))!;
    expect(passed.status).toBe("ready");
    expect(passed.headline).toBe("Holds the load, safety factor 521");
    expect(passed.issues).toEqual([
      { severity: "warning", summary: slow.message, fix: null, note: true },
    ]);

    // A real warning beside it still makes the status and the headline, and is listed first.
    const margin = {
      severity: "warning",
      code: "low_margin",
      message: "It holds, but only 1.4× the load: under the 2× margin",
      location: null,
      hint: "safety factor 1.4, margin 2",
    };
    const thin = parseCheckResult("studies/shelf/result.json", answer([slow, margin], 1.472))!;
    expect(thin.status).toBe("warnings");
    expect(thin.headline).toBe(margin.message);
    expect(thin.issues.map((issue) => issue.note ?? false)).toEqual([false, true]);

    // An error is an error whatever its code, and a verdict's own headline still leads.
    const failed = parseCheckResult(
      "studies/a/result.json",
      answer([slow, { ...slow, severity: "error", message: "The solve did not finish" }], 2),
    )!;
    expect(failed.status).toBe("fix");
    expect(failed.headline).toBe("The solve did not finish");
    expect(failed.issues.map((issue) => issue.note ?? false)).toEqual([false, true]);
  });

  it("reads the examples' strength checks as they ship: a note about the run alone is a pass", () => {
    const shipped = (sample: string, study: string) =>
      parseCheckResult(
        `studies/${study}/result.json`,
        NodeFS.readFileSync(
          NodePath.join(SAMPLES, sample, "studies", study, "result.json"),
          "utf8",
        ),
      )!;
    expect(shipped("motor-mount", "motor_plate")).toMatchObject({
      status: "ready",
      headline: "Holds the load, safety factor 521",
    });
    expect(shipped("servo-bracket", "servo_bracket")).toMatchObject({
      status: "ready",
      headline: "Holds the load, safety factor 3.7",
    });
    // The shelf bracket's margin is thin: that is its warning, and its notes come after.
    const shelf = shipped("shelf-bracket", "shelf_bracket");
    expect(shelf.status).toBe("warnings");
    expect(shelf.headline).toMatch(/^It holds, but only 1\.4× the load/);
    expect(shelf.issues.map((issue) => issue.note ?? false)).toEqual([false, false, true, true]);
  });

  it("leaves a 0.11 CAM job's answer out of the part's checks, and files it with the part", () => {
    const plan = JSON.stringify({
      ok: true,
      path: "/work/parts/plate.step",
      findings: [],
      summary: "Ready to cut",
      measurements: { verdict: { status: "ready", headline: "Ready to cut" } },
    });
    expect(isCheckResultPath("CAM/result.json")).toBe(true);
    expect(parseCheckResult("CAM/result.json", plan)).toBeNull();
    const parts = [file("parts/plate.step"), file("parts/bracket.step")];
    const studies = [
      "studies/plate-load/result.glb",
      "studies/plate-load/result.json",
      "studies/result.glb",
    ].map(file);
    const made = manufacturingFor(parts, ["cam/plate/result.glb", "cam/plate.top.nc"].map(file));
    expect(made.get("parts/plate.step")?.map((entry) => entry.path)).toEqual([
      "cam/plate/result.glb",
      "cam/plate.top.nc",
    ]);
    expect(
      studiesFor(parts, studies)
        .get("parts/plate.step")
        ?.map((entry) => entry.path),
    ).toEqual(["studies/plate-load/result.glb", "studies/plate-load/result.json"]);
  });

  it("drops a check run before its model was last built, and pictures a renamed study by its own file", () => {
    // The 3 mm run, kept under a new name after the bracket went to 4 mm: its `glb` still names
    // the picture the 4 mm run now owns.
    const solved = (glb: string) =>
      JSON.stringify({
        document: "parts/bracket.step",
        glb,
        study: {},
        summary: { checks: [{ label: "Strength" }] },
        findings: [{ severity: "warning", summary: "It holds, but only 1.1× the load" }],
      });
    const before = parseCheckResult(
      "studies/tip-load-3mm.result.json",
      solved("studies/tip-load.glb"),
      "2026-11-02T21:33:24.000Z",
    )!;
    const after = parseCheckResult(
      "studies/tip-load.result.json",
      solved("studies/tip-load.glb"),
      "2026-11-02T21:33:57.000Z",
    )!;
    expect(before.model).toBe("studies/tip-load-3mm.glb");
    const bracket: ProjectFile = {
      path: "7dde5cd8-809d-5212-afd0-2a5e48278472",
      name: "bracket.py",
      title: "Bracket",
      folder: "parts",
      group: "CAD",
      kind: "Part",
      document: "7dde5cd8-809d-5212-afd0-2a5e48278472",
      script: "parts/bracket.py",
      version: String(Date.parse("2026-11-02T21:33:25.462Z") / 1000),
    };
    expect(currentResults([bracket], [before, after])).toEqual([after]);
    // A result whose file names no time, or a part the engine has not built, is kept.
    const untimed = parseCheckResult("studies/tip-load-3mm.result.json", solved("x.glb"))!;
    expect(currentResults([bracket], [untimed])).toEqual([untimed]);
    const { version: _, ...unbuilt } = bracket;
    expect(currentResults([unbuilt], [before])).toEqual([before]);
  });

  it("says a check is out of date only when its part was built after it", () => {
    const built = String(Date.parse("2026-11-02T21:33:25Z") / 1000);
    const before = { written: Date.parse("2026-11-02T21:33:24Z") / 1000 };
    const after = { written: Date.parse("2026-11-02T21:33:26Z") / 1000 };
    expect(checkOutOfDate(before, { version: built })).toBe(true);
    expect(checkOutOfDate(after, { version: built })).toBe(false);
    expect(checkOutOfDate({}, { version: built })).toBe(false);
    expect(checkOutOfDate(before, {})).toBe(false);
  });

  it("leaves a copied example's check unmarked: its model has never been built", () => {
    const copied = parseCheckResult(
      "studies/servo_bracket/result.json",
      JSON.stringify({ document: "parts/servo_bracket.step", findings: [] }),
      "2026-11-06T09:00:00.000Z",
    )!;
    expect(checkOutOfDate(copied, file("parts/servo_bracket.step"))).toBe(false);
    // Its first build rewrites the check (`copyThenOpen`), which then comes after that build.
    expect(
      checkOutOfDate({ written: copied.written! + 60 }, { version: String(copied.written! + 30) }),
    ).toBe(false);
  });

  it("finds a part's drawing sheet, wherever it is filed", () => {
    const part = file("parts/bracket.step");
    expect(
      drawingsFor(part, [
        "drawings/bracket_drawing.pdf",
        "parts/bracket_drawing.py",
        "drawings/bracket_mount_drawing.pdf",
        "docs/bracket.pdf",
      ]),
    ).toEqual(["drawings/bracket_drawing.pdf"]);
  });

  it("gives each manufacturing file to the part it was made from", () => {
    const parts = [
      "parts/bracket.step",
      "parts/bracket_v2.step",
      "v1/plate.step",
      "v2/plate.step",
      "electronics/servo_power.kicad_pcb",
    ].map(file);
    const made = manufacturingFor(parts, [
      ...parts,
      ...[
        "cam/bracket.cam.glb",
        "cam/bracket.cam.json",
        "cam/bracket_v2.nc",
        "v2/out/plate.nc",
        "electronics/servo_power.gerbers.zip",
        "electronics/servo_power.bom.csv",
        "electronics/gerbers.zip",
        "cam/bracketry.nc",
        "drawings/bracket_drawing.pdf",
      ].map(file),
    ]);
    const names = (path: string) => made.get(path)?.map((entry) => entry.path) ?? [];
    expect(names("parts/bracket.step")).toEqual(["cam/bracket.cam.glb", "cam/bracket.cam.json"]);
    expect(names("parts/bracket_v2.step")).toEqual(["cam/bracket_v2.nc"]);
    expect(names("v1/plate.step")).toEqual([]);
    expect(names("v2/plate.step")).toEqual(["v2/out/plate.nc"]);
    expect(names("electronics/servo_power.kicad_pcb")).toEqual([
      "electronics/servo_power.gerbers.zip",
      "electronics/servo_power.bom.csv",
    ]);
  });

  it("asks the agent to propose a fix and wait, never to change the part", () => {
    const result = parseCheckResult("bossbar.casting.result.json", casting)!;
    expect(proposeFixPrompt(result, result.issues[0]!)).toBe(
      "The casting check on bossbar.step found: An isolated hot spot in the boss freezes last. " +
        "The check suggests: Feed it from #o1.f7: a riser of modulus 2.9 mm. " +
        "Propose a fix: ask me with the change you recommend first and what you expect it to give, and wait for my pick before changing the part.",
    );
    expect(
      proposeFixPrompt(result, result.issues[0]!, "[bossbar.step](parts/bossbar.step)"),
    ).toMatch(/^The casting check on \[bossbar\.step\]\(parts\/bossbar\.step\) found: /);
  });
});
