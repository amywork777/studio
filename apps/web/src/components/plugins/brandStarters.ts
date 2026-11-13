import type { InstalledPlugin } from "@t3tools/contracts";

/** A brand's starter (`brand.json` `starters`) and the plugin skill it needs, if any. */
export interface BrandStarter {
  readonly prompt: string;
  readonly skill: string | null;
}

/** The brand's starters (`apps/web/vite/brand.ts`); empty for T3 Code and malformed input. */
export function readBrandStarters(json: string | undefined): BrandStarter[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return [];
      const { prompt, skill } = entry as Record<string, unknown>;
      if (typeof prompt !== "string" || prompt.trim() === "") return [];
      return [{ prompt: prompt.trim(), skill: typeof skill === "string" ? skill : null }];
    });
  } catch {
    return [];
  }
}

export const BRAND_STARTERS = readBrandStarters(import.meta.env.VITE_APP_STARTERS);

/**
 * A starter that needs a skill shows only while an enabled plugin has it, so a new thread never
 * offers a job the agent has no skill for. Null when the brand has none, so the plugins' own
 * starters stand.
 */
export function brandStarterPrompts(
  starters: ReadonlyArray<BrandStarter>,
  plugins: ReadonlyArray<InstalledPlugin>,
  limit: number,
): string[] | null {
  if (starters.length === 0) return null;
  const skills = new Set(plugins.flatMap((plugin) => (plugin.enabled ? plugin.skills : [])));
  return starters
    .filter((starter) => starter.skill === null || skills.has(starter.skill))
    .slice(0, limit)
    .map((starter) => starter.prompt);
}
