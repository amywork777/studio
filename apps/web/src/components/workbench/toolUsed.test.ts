import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS } from "./hardwareActions";
import { chatTitleText, toolUsed, withToolLine } from "./toolUsed";

const named = (text: string) => toolUsed(text)?.tools.map((tool) => tool.label);

describe("the tool a chat message came from", () => {
  it("reads back the tool and the job", () => {
    const used = toolUsed(withToolLine("Engineering drawing", "Draw bracket.step."));
    expect(used?.tools.map((tool) => tool.id)).toEqual(["drawing"]);
    expect(used?.message).toBe("Draw bracket.step.");
    expect(used?.words).toBe("");
  });

  it("finds the tool pressed on top of a draft, the composer joining them with a space", () => {
    const text = `Make the wall thicker first. ${withToolLine("Strength under load", "Run FEA.")}`;
    const used = toolUsed(text);
    expect(used?.tools.map((tool) => tool.label)).toEqual(["Strength under load"]);
    expect(used?.words).toBe("Make the wall thicker first.");
    expect(used?.message).toBe("Make the wall thicker first.\n\nRun FEA.");
  });

  it("names each tool pressed once, whatever else was written around them", () => {
    const fea = withToolLine("Strength under load", "Run FEA.");
    const drawing = withToolLine("Engineering drawing", "Draw it.");
    expect(named(`${fea} ${drawing}`)).toEqual(["Strength under load", "Engineering drawing"]);
    expect(named(`${fea} ${fea}`)).toEqual(["Strength under load"]);
    expect(named(`Before\n\n${fea}\n\nAfter`)).toEqual(["Strength under load"]);
  });

  it("leaves a typed message alone", () => {
    expect(toolUsed("Draw bracket.step.")).toBeNull();
    expect(toolUsed("Please use the Tool: drawing one")).toBeNull();
    expect(toolUsed("Tool: nothing after it")).toBeNull();
    expect(toolUsed("The first Tool: no tool of ours\n\nWhat does that mean?")).toBeNull();
  });

  it("can tell every tile from its name alone", () => {
    const names = HARDWARE_ACTIONS.map((action) => action.label);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("what a chat a tool opened is titled from", () => {
  it("is the tool on its own, and the person's words over a job they wrote around", () => {
    expect(chatTitleText(withToolLine("Strength under load", "Run FEA."))).toBe(
      "Strength under load",
    );
    expect(chatTitleText(`Thicker wall? ${withToolLine("Strength under load", "Run FEA.")}`)).toBe(
      "Thicker wall?",
    );
  });

  it("leaves a typed message as it is", () => {
    expect(chatTitleText("Draw bracket.step.")).toBe("Draw bracket.step.");
  });

  it("is the person's words over what the model view sent, else what it picked", () => {
    const about = "File: 29ae9a38\nReferences:\n29ae9a38#led_module/f:led_module.body_face3~ee2f";
    expect(chatTitleText(`Make this face 2 mm thinner\n\n${about}`)).toBe(
      "Make this face 2 mm thinner",
    );
    expect(chatTitleText(about)).toBe("LED module · 1 face");
  });
});
