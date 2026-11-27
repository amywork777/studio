import { describe, expect, it } from "vite-plus/test";

import {
  buildProblems,
  decision,
  decisionPasses,
  offersImplicit,
  runFacts,
  type BuildFacts,
} from "./grade.ts";

const line = (event: unknown) => JSON.stringify(event);
const assistant = (...content: unknown[]) => line({ type: "assistant", message: { content } });

describe("cad-implicits grading", () => {
  it("reads what the agent wrote and ran, and which gsl step was refused", () => {
    const stream = [
      assistant({ type: "tool_use", name: "Skill", input: { skill: "text-to-cad:cad" } }),
      assistant({ type: "tool_use", name: "Write", input: { file_path: "/p/parts/core.gsl" } }),
      assistant({
        type: "tool_use",
        id: "a",
        name: "Bash",
        input: { command: "cad gsl step parts/core.gsl" },
      }),
      line({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "a",
              content: "error: step_outside_tolerance at x",
            },
          ],
        },
      }),
      assistant({
        type: "tool_use",
        id: "b",
        name: "Bash",
        input: { command: "cad gsl step parts/core.gsl --depth 10" },
      }),
      line({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "OK" }] },
          ],
        },
      }),
      assistant({ type: "text", text: "Done." }),
      line({ type: "result", total_cost_usd: 1.25, num_turns: 9 }),
      '{"cut off',
    ].join("\n");
    const facts = runFacts(stream);
    expect(facts.gslFiles).toEqual(["/p/parts/core.gsl"]);
    expect(facts.stepRuns.map((run) => run.refused)).toEqual([true, false]);
    expect([facts.loadedCadSkill, facts.costUsd, facts.turns, facts.finalText]).toEqual([
      true,
      1.25,
      9,
      "Done.",
    ]);
    expect(decision(facts)).toBe("gsl");
  });

  it("counts an offer only where a paragraph names the implicit route and asks", () => {
    expect(offersImplicit("Built R1.5.\n\nTry a smooth blend at R6 in GSL?")).toBe(true);
    expect(offersImplicit("It prints at 15% infill.\n\nWant it in PETG instead?")).toBe(false);
    expect(offersImplicit("I used a lattice, as asked.")).toBe(false);
    expect(
      offersImplicit("Exact fillets, so no smooth blend. See http://127.0.0.1:1/x?token=1"),
    ).toBe(false);
    expect(decisionPasses("exact-or-gsl", "exact")).toBe(true);
    expect(decisionPasses("exact-or-gsl", "offer")).toBe(false);
    expect(decisionPasses("exact-or-offer", "offer")).toBe(true);
    expect(decisionPasses("exact-or-offer", "gsl")).toBe(false);
  });

  it("fails a part that lost its exact holes, its base, its weight target, or carries a field it should not", () => {
    const build: BuildFacts = {
      built: true,
      valid: true,
      solids: 1,
      stepValid: true,
      watertight: true,
      bodies: 1,
      cylinders: [2.75, 2.75],
      facets: 4000,
      baseArea: 3000,
      seedBaseArea: 3150,
      volume: 17000,
      seedVolume: 29800,
    };
    const checks = {
      holes: [{ radius: 2.75, count: 2 }],
      baseKept: 0.5,
      volumeRatio: [0.45, 0.75] as const,
    };
    expect(buildProblems(checks, build, "gsl")).toEqual([]);
    expect(buildProblems(checks, { ...build, cylinders: [2.75] }, "gsl")).toEqual([
      "1 exact r2.75 holes, want 2",
    ]);
    expect(buildProblems(checks, { ...build, volume: 29000 }, "gsl")).toEqual([
      "volume 97% of the seed's",
    ]);
    expect(buildProblems(checks, { ...build, baseArea: 900 }, "gsl")).toEqual([
      "flat base 29% of the seed's",
    ]);
    expect(buildProblems(checks, build, "exact")).toEqual(["faceted faces in a part kept exact"]);
    expect(buildProblems(checks, { ...build, facets: 12 }, "gsl")).toEqual([
      "GSL written but none of it in the part",
    ]);
    const fillet = { blend: 6 };
    const plain = { ...build, cylinders: [], facets: 0 };
    expect(buildProblems(fillet, { ...plain, cylinders: [6, 6] }, "exact")).toEqual([]);
    expect(buildProblems(fillet, plain, "exact")).toEqual(["no R6 blend in the part"]);
    expect(buildProblems(checks, { built: false, error: "no part" }, "exact")).toEqual([
      "not built: no part",
    ]);
  });
});
