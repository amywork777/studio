import type { ProviderOptionDescriptor, RuntimeMode } from "@t3tools/contracts";

/**
 * The composer's options in an engineer's words, for the engineering
 * interface. Only what the menus say changes: every pick still sends the
 * model's own value, so a thread reads the same in the code interface.
 */

type Choice = Extract<ProviderOptionDescriptor, { type: "select" }>["options"][number];

const THINKING_LEVELS: Readonly<Record<string, string>> = {
  low: "Quick",
  medium: "Normal",
  high: "Careful",
};

/** Effort past High. They show as one "Thorough". */
const THOROUGH_LEVELS: ReadonlySet<string> = new Set(["xhigh", "max", "ultra"]);

const isThinking = (descriptor: ProviderOptionDescriptor) =>
  descriptor.label === "Reasoning" ||
  descriptor.id === "reasoningEffort" ||
  descriptor.id === "effort";

/**
 * "Thorough" stands for the level in use when it is one past High, otherwise
 * for the highest the model offers, so the menu never hides what is picked.
 */
function thinkingChoices(options: ReadonlyArray<Choice>, current: string | null): Choice[] {
  // Options come lowest first, so the last of them is the highest.
  const thorough = options.filter((option) => THOROUGH_LEVELS.has(option.id));
  const target = thorough.find((option) => option.id === current) ?? thorough.at(-1);
  const choices: Choice[] = [];
  for (const option of options) {
    if (THOROUGH_LEVELS.has(option.id)) {
      if (option === thorough[0] && target !== undefined) {
        choices.push({
          id: target.id,
          label: "Thorough",
          ...(target.isDefault ? { isDefault: true } : {}),
        });
      }
      continue;
    }
    const label = THINKING_LEVELS[option.id];
    choices.push(label === undefined ? option : { ...option, label });
  }
  return choices;
}

const plainSpeedNote = (note: string) =>
  note
    .replace(/\b2x speed\b/i, "Twice as fast")
    .replace(/\bincreased usage\b/i, "uses more of your plan");

/**
 * A composer option as the engineering interface shows it: "Reasoning" reads
 * "Thinking" (Quick, Normal, Careful, Thorough) and "Service Tier" reads
 * "Speed" (Normal, Fast). `current` is the value in use, so Thorough can
 * stand for it. Other options pass through as they are.
 */
export function engineeringTraitDescriptor(
  descriptor: ProviderOptionDescriptor,
  current: string | null,
): ProviderOptionDescriptor {
  if (descriptor.type !== "select") return descriptor;
  if (isThinking(descriptor)) {
    return {
      ...descriptor,
      label: "Thinking",
      options: thinkingChoices(descriptor.options, current),
    };
  }
  if (descriptor.id === "serviceTier") {
    return {
      ...descriptor,
      label: "Speed",
      options: descriptor.options.map((option) => ({
        ...option,
        ...(option.id === "default" ? { label: "Normal" } : {}),
        ...(option.description ? { description: plainSpeedNote(option.description) } : {}),
      })),
    };
  }
  return descriptor;
}

export const ENGINEERING_RUNTIME_MODES: Readonly<
  Record<RuntimeMode, { readonly label: string; readonly description: string }>
> = {
  "approval-required": {
    label: "Ask before changing anything",
    description: "You approve every file change and every tool it runs.",
  },
  "auto-accept-edits": {
    label: "Change files, ask before running tools",
    description: "Edits files on its own and asks before running anything.",
  },
  auto: {
    label: "Decide for itself",
    description: "Handles routine work without asking. Some agents still ask.",
  },
  "full-access": {
    label: "Work without asking",
    description: "Changes files and runs tools without asking.",
  },
};
