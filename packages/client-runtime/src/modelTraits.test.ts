import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildTraitsTriggerDisplay, getDescriptorStringValue } from "./modelTraits.ts";

describe("buildTraitsTriggerDisplay", () => {
  it.each([
    { currentValue: undefined, defaultValue: undefined, value: null, label: "Thinking" },
    { currentValue: undefined, defaultValue: "high", value: "high", label: "High" },
    { currentValue: "low", defaultValue: undefined, value: "low", label: "Low" },
    { currentValue: "max", defaultValue: "high", value: "max", label: "Max" },
    { id: "effort", currentValue: undefined, defaultValue: undefined, value: null, label: "" },
  ])("labels Pi thinking without inventing a selection: $label ($value)", (input) => {
    const descriptor: Extract<ProviderOptionDescriptor, { type: "select" }> = {
      id: input.id ?? "thinking",
      label: "Thinking",
      type: "select",
      options: ["low", "high", "max"].map((id) => ({
        id,
        label: id[0]!.toUpperCase() + id.slice(1),
        ...(id === input.defaultValue ? { isDefault: true } : {}),
      })),
      ...(input.currentValue ? { currentValue: input.currentValue } : {}),
    };

    expect(
      buildTraitsTriggerDisplay({
        descriptors: [descriptor],
        primarySelectDescriptorId: descriptor.id,
        ultrathinkPromptControlled: false,
      }).label,
    ).toBe(input.label);
    expect(getDescriptorStringValue(descriptor)).toBe(input.value);
  });
});

describe("buildTraitsTriggerDisplay with nameTrait", () => {
  const effort: Extract<ProviderOptionDescriptor, { type: "select" }> = {
    id: "reasoningEffort",
    label: "Thinking",
    type: "select",
    options: [
      { id: "high", label: "High" },
      { id: "max", label: "Max" },
    ],
    currentValue: "high",
  };
  const contextWindow: Extract<ProviderOptionDescriptor, { type: "select" }> = {
    id: "contextWindow",
    label: "contextWindow",
    type: "select",
    options: [
      { id: "200k", label: "200k" },
      { id: "1m", label: "1M" },
    ],
    currentValue: "1m",
  };
  const fastMode = (
    currentValue: boolean,
  ): Extract<ProviderOptionDescriptor, { type: "boolean" }> => ({
    id: "fastMode",
    label: "Fast Mode",
    type: "boolean",
    currentValue,
  });
  const label = (descriptors: ReadonlyArray<ProviderOptionDescriptor>, nameTrait: boolean) =>
    buildTraitsTriggerDisplay({
      descriptors,
      primarySelectDescriptorId: "reasoningEffort",
      ultrathinkPromptControlled: false,
      nameTrait,
    }).label;

  it("says what the pick adjusts, in the menu's word", () => {
    expect(label([effort, contextWindow], true)).toBe("Thinking: High · 1M");
    expect(label([effort, fastMode(true)], true)).toBe("Thinking: High Fast");
    expect(label([fastMode(false)], true)).toBe("Speed: Normal");
    expect(label([fastMode(true)], true)).toBe("Speed: Fast");
  });

  it("leaves the composer's short labels alone without it", () => {
    expect(label([effort, contextWindow], false)).toBe("High · 1M");
    expect(label([effort, fastMode(true)], false)).toBe("High Fast");
    expect(label([fastMode(false)], false)).toBe("Normal");
  });

  it("names nothing when no reasoning or speed choice is shown", () => {
    expect(label([contextWindow], true)).toBe("1M");
  });
});
