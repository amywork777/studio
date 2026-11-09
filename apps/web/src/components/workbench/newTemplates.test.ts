import type { InstalledPlugin } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { fileStem, NEW_TEMPLATES, newWorkPrompt, templateOffers } from "./newTemplates";

const template = (id: string) => NEW_TEMPLATES.find((entry) => entry.id === id)!;

/** An installed plugin listing these skills, as the plugin list sends it. */
const plugin = (id: string, enabled: boolean, skills: ReadonlyArray<string>): InstalledPlugin => ({
  id,
  displayName: `The ${id} plugin`,
  description: "",
  version: null,
  publisher: null,
  enabled,
  marketplace: null,
  commit: null,
  skills: [...skills],
  servers: [],
  views: [],
  compatibility: { level: "works", label: "Works", notes: [] },
  updateAvailable: false,
  error: null,
});

/** text-to-cad, enabled and listing fea, while only cad is among the skills that are on. */
const textToCad = plugin("text-to-cad", true, ["cad", "engineering-drawing", "fea"]);
const offers = templateOffers(new Set(["cad"]), [textToCad]);
const offerOf = (id: string) => offers.find((offer) => offer.template.id === id);

/** The templates New offers on, with these skills on. */
const onWith = (skills: ReadonlyArray<string>) =>
  templateOffers(new Set(skills), [textToCad])
    .filter((offer) => offer.availability.on)
    .map((offer) => offer.template);

describe("new templates", () => {
  it("offers only what the installed skills can do; documents need none", () => {
    expect(onWith(["cad"]).map((entry) => entry.id)).toEqual([
      "part",
      "assembly",
      "sheet-metal",
      "cut-file",
      "test-plan",
      "prd",
      "requirements",
      "fmea",
      "design-review",
    ]);
    expect(onWith(["fea", "cam"]).map((entry) => entry.label)).toContain("Strength under load");
    expect(onWith(["cad", "work-instructions"]).map((entry) => entry.id)).toContain("instructions");
  });

  it("names new work by a file name the agent can use", () => {
    expect(fileStem("  Wall Bracket (rev B) ")).toBe("wall_bracket_rev_b");
    expect(fileStem("***")).toBe("untitled");
    expect(
      newWorkPrompt({
        template: template("part"),
        name: "Wall bracket",
        folder: "parts/",
        units: "mm",
        part: null,
        description: "80 mm wide, two M5 holes",
      }),
    ).toBe(
      "Create a new part as a CAD model in parts/wall_bracket.py, in millimeters. 80 mm wide, two M5 holes.",
    );
    // An assembly is a model too.
    const assembly = newWorkPrompt({
      template: template("assembly"),
      name: "Arm",
      folder: "assemblies",
      units: "in",
      part: null,
      description: "",
    });
    expect(assembly).toBe(
      "Create a new assembly as a CAD model in assemblies/arm.py, in inches, using the project's parts where they fit.",
    );
  });

  it("offers what is on and names what is off", () => {
    expect(offerOf("strength-study")?.availability).toEqual({
      on: false,
      skill: "fea",
      plugin: "text-to-cad",
      installed: true,
    });
    expect(offerOf("part")?.availability).toEqual({ on: true });
    expect(offerOf("prd")?.availability).toEqual({ on: true });
  });

  it("keeps the order New shows", () => {
    expect(offers.map((offer) => offer.template.id).slice(0, 5)).toEqual([
      "part",
      "assembly",
      "sheet-metal",
      "drawing",
      "strength-study",
    ]);
  });

  it("works from the chosen part for a study, a CAM job or a drawing", () => {
    const work = { name: "", folder: "", units: "in" as const, description: "" };
    expect(
      newWorkPrompt({
        ...work,
        template: template("strength-study"),
        part: "parts/STEP/l_bracket.step",
      }),
    ).toMatch(/^Run a strength study on parts\/STEP\/l_bracket\.step under its working load\. /);
    expect(
      newWorkPrompt({ ...work, template: template("drawing"), part: "parts/STEP/l_bracket.step" }),
    ).toContain("in inches.");
  });
});
