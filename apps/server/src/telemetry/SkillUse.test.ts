import { assert, it } from "@effect/vitest";

import { skillsUsed } from "./SkillUse.ts";

it("counts a job a tool wrote into the message", () => {
  assert.deepEqual(
    skillsUsed("Tool: Strength under load\n\nCheck [the bracket](a.py) holds 50 N."),
    [{ skill: "fea", job: "strength", how: "tool" }],
  );
});

it("counts a skill or a job typed by name, and nothing else typed", () => {
  assert.deepEqual(skillsUsed("use $cad to make a hinge"), [
    { skill: "cad", job: "none", how: "typed" },
  ]);
  assert.deepEqual(skillsUsed("$fdm please"), [{ skill: "cad", job: "fdm", how: "typed" }]);
  // A skill a person named, a price, a sentence that says "Tool:": none of it is counted.
  assert.deepEqual(skillsUsed("$acme-secret-gearbox costs $40. Tool: my own thing\n\nhi"), []);
});

it("counts each once", () => {
  assert.lengthOf(skillsUsed("$cad and $cad again"), 1);
});
