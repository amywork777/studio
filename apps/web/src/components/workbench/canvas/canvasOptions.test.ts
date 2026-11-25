import { describe, expect, it } from "vite-plus/test";

import { CARD, nextKeys, optionPlaces, optionsMessage, readDesignOptions } from "./canvasOptions";

const entry = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  name: `Option ${key}`,
  idea: "Folded from one sheet.",
  script: `parts/option_${key}.py`,
  model: `doc-${key}`,
  glb: `canvas/option_${key}.glb`,
  material: "6061 aluminum",
  mass_g: 42.5,
  ...extra,
});

describe("readDesignOptions", () => {
  it("reads the agent's options in order", () => {
    const read = readDesignOptions(JSON.stringify({ options: [entry("a"), entry("b")] }));
    expect(read?.map((option) => [option.key, option.massGrams, option.from])).toEqual([
      ["a", 42.5, null],
      ["b", 42.5, null],
    ]);
  });

  it("is null while the file is half written, so the last read stands", () => {
    expect(readDesignOptions('{"options": [{"key": "a"')).toBeNull();
  });

  it("leaves out an option with no mesh, a path outside the project, or a letter used twice", () => {
    const read = readDesignOptions(
      JSON.stringify({
        options: [
          entry("a"),
          entry("a", { name: "again" }),
          entry("b", { glb: "../elsewhere/b.glb" }),
          entry("c", { glb: "/abs/c.glb" }),
          entry("d", { glb: undefined }),
          entry("e"),
        ],
      }),
    );
    expect(read?.map((option) => option.key)).toEqual(["a", "e"]);
    expect(read?.[0]?.name).toBe("Option a");
  });

  it("says a mass that was not measured is not known, never zero", () => {
    const read = readDesignOptions(
      JSON.stringify({ options: [entry("a", { mass_g: null }), entry("b", { mass_g: "12 g" })] }),
    );
    expect(read?.map((option) => option.massGrams)).toEqual([null, null]);
  });
});

describe("nextKeys", () => {
  it("takes the next four free letters", () => {
    expect(nextKeys([])).toEqual(["a", "b", "c", "d"]);
    expect(nextKeys(["a", "b", "c", "d"])).toEqual(["e", "f", "g", "h"]);
  });
});

describe("optionsMessage", () => {
  it("names each option's script, mesh and the file the canvas reads", () => {
    const message = optionsMessage({
      description: "A wall bracket for a 2 kg shelf",
      references: ["references/sketch.png"],
      keys: ["a", "b"],
      from: null,
    });
    expect(message).toContain("Make 2 design options");
    expect(message).toContain("`references/sketch.png`");
    expect(message).toContain('"glb": "canvas/option_b.glb"');
    expect(message).toContain("canvas/options.json");
    expect(message).not.toContain('"from"');
  });

  it("asks a More like this set to grow from its option", () => {
    const [from] = readDesignOptions(JSON.stringify({ options: [entry("b")] }))!;
    const message = optionsMessage({ description: "", references: [], keys: ["e"], from: from! });
    expect(message).toContain("grow from option B");
    expect(message).toContain('"from": "b"');
  });
});

describe("optionPlaces", () => {
  it("puts a first set in a row and a later set under the option it grew from", () => {
    const options = readDesignOptions(
      JSON.stringify({
        options: [
          entry("a"),
          entry("b"),
          entry("c"),
          entry("d"),
          entry("e", { from: "c" }),
          entry("f", { from: "c" }),
        ],
      }),
    )!;
    const places = optionPlaces(options, { x: 0, y: 0 });
    const step = CARD.width + CARD.gap;
    expect(places.get("b")).toEqual({ x: step, y: 0 });
    expect(places.get("e")?.x).toBe(2 * step);
    expect(places.get("e")!.y).toBeGreaterThan(0);
    expect(places.get("f")).toEqual({ x: 3 * step, y: places.get("e")!.y });
  });
});
