import { describe, expect, it } from "vite-plus/test";

import {
  conceptSetOf,
  isBrainstormFile,
  lightestConcept,
  massLabel,
  readConceptSet,
} from "./brainstorm";

describe("a brainstorm's set of concepts", () => {
  it("knows a set's file among a turn's changed files, and nothing else", () => {
    expect(conceptSetOf("brainstorm/set-2/concepts.json")).toBe(2);
    expect(conceptSetOf("./brainstorm/set-12/concepts.json")).toBe(12);
    expect(conceptSetOf("brainstorm\\set-1\\concepts.json")).toBe(1);
    expect(conceptSetOf("brainstorm/set-1/a.png")).toBeNull();
    expect(conceptSetOf("parts/brainstorm/set-1/concepts.json")).toBeNull();
    // Its pictures show on its cards, not again in what changed; its parts' scripts do show.
    expect(isBrainstormFile("brainstorm/set-1/a.png")).toBe(true);
    expect(isBrainstormFile("parts/concept_1a.py")).toBe(false);
  });

  it("keeps each concept whose script is in the project, once, and weighs only what was measured", () => {
    const read = readConceptSet(
      1,
      JSON.stringify({
        concepts: [
          {
            name: "Bent plate",
            script: "parts/concept_1a.py",
            picture: "brainstorm/set-1/a.png",
            mass_g: 42.7,
          },
          { name: "Twice", script: "parts/concept_1a.py", mass_g: 1 },
          { script: "parts\\concept_1b.py", mass_g: "about 30" },
          { name: "Outside", script: "../elsewhere.py" },
          { name: "Absolute", script: "/tmp/part.py" },
          { name: "Not a script", script: "parts/concept_1c.step" },
          {
            name: "Escaping picture",
            script: "parts/concept_1d.py",
            picture: "../../x.png",
            mass_g: 0,
          },
        ],
      }),
    );
    expect(read?.concepts).toEqual([
      {
        name: "Bent plate",
        idea: "",
        script: "parts/concept_1a.py",
        picture: "brainstorm/set-1/a.png",
        material: null,
        massGrams: 42.7,
      },
      {
        name: "Concept 3",
        idea: "",
        script: "parts/concept_1b.py",
        picture: null,
        material: null,
        massGrams: null,
      },
      {
        name: "Escaping picture",
        idea: "",
        script: "parts/concept_1d.py",
        picture: null,
        material: null,
        massGrams: null,
      },
    ]);
  });

  it("waits on a file the agent is still writing", () => {
    expect(readConceptSet(1, '{"concepts": [{"name": "Ha')).toBeNull();
    expect(readConceptSet(1, "{}")?.concepts).toEqual([]);
  });

  it("says a mass was not checked rather than guess one, and marks the lightest of two or more", () => {
    expect(massLabel(null)).toBe("Not checked");
    expect(massLabel(4.25)).toBe("4.3 g");
    expect(massLabel(427.4)).toBe("427 g");
    expect(massLabel(1530)).toBe("1.53 kg");
    const concept = (script: string, massGrams: number | null) => ({
      name: script,
      idea: "",
      script,
      picture: null,
      material: null,
      massGrams,
    });
    expect(lightestConcept([concept("a", 40), concept("b", null), concept("c", 31)])).toBe("c");
    expect(lightestConcept([concept("a", 40), concept("b", null)])).toBeNull();
  });
});
