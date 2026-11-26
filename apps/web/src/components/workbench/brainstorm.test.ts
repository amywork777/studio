import { describe, expect, it } from "vite-plus/test";

import {
  asProjectPart,
  conceptSetsIn,
  lightestConcept,
  massLabel,
  readConceptSet,
} from "./brainstorm";

describe("a brainstorm's set of concepts", () => {
  it("finds the sets a reply links in its own chat's folder, once each", () => {
    const folder = "/studio/rover/brainstorm/thread-7";
    const reply = [
      "Which way should I take it?",
      `[Concepts, set 2](${folder}/set-2/concepts.json)`,
      `Also [set 3](file://${folder}/set-3/concepts.json) and again ${folder}/set-2/concepts.json`,
      "C:\\Studio\\rover\\brainstorm\\thread-7\\set-4\\concepts.json",
      // Another chat's set, and a picture of this one's, are not sets of this reply.
      "/studio/rover/brainstorm/thread-8/set-1/concepts.json",
      `${folder}/set-1/ribbed.png`,
    ].join("\n");
    expect(conceptSetsIn(reply, "thread-7")).toEqual([2, 3, 4]);
    expect(conceptSetsIn("No concepts here.", "thread-7")).toEqual([]);
  });

  it("keeps each concept whose script is a file of its set, once, and weighs only what was measured", () => {
    const read = readConceptSet(
      1,
      JSON.stringify({
        concepts: [
          {
            name: "Bent plate",
            script: "bent_plate.py",
            picture: "bent_plate.png",
            mass_g: 42.7,
          },
          { name: "Twice", script: "bent_plate.py", mass_g: 1 },
          { script: "saddle.py", mass_g: "about 30" },
          { name: "In the project", script: "parts/concept.py" },
          { name: "Outside", script: "../elsewhere.py" },
          { name: "Absolute", script: "/tmp/part.py" },
          { name: "Not a script", script: "truss.step" },
          {
            name: "Escaping picture",
            script: "pedestal.py",
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
        script: "bent_plate.py",
        picture: "bent_plate.png",
        material: null,
        massGrams: 42.7,
      },
      {
        name: "Concept 3",
        idea: "",
        script: "saddle.py",
        picture: null,
        material: null,
        massGrams: null,
      },
      {
        name: "Escaping picture",
        idea: "",
        script: "pedestal.py",
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

  it("names a used concept's model after the part it becomes, and only its model", () => {
    const script = [
      "@model",
      "def bent_plate():",
      '    body.label = "bent_plate"',
      "    return bent_plate_body(bent_plate_width)",
      "",
      "bent_plate()",
    ].join("\n");
    expect(asProjectPart(script, "bent_plate", "bent_plate")).toBe(script);
    expect(asProjectPart(script, "bent_plate", "bent_plate_2")).toBe(
      [
        "@model",
        "def bent_plate_2():",
        '    body.label = "bent_plate_2"',
        "    return bent_plate_body(bent_plate_width)",
        "",
        "bent_plate_2()",
      ].join("\n"),
    );
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
