/**
 * The one model name usage data may carry: a vendor catalog's own slug, never a name from a
 * person's configuration.
 *
 * @module ProviderDimensions
 */
import type { ServerProvider } from "@t3tools/contracts";

import { BUNDLED_MODEL_MANIFEST } from "../provider/ModelManifest.ts";

const DATED_SNAPSHOT = /-\d{8}$/u;

// The bundled manifest is reviewed in this repo. Codex lists whatever its configured
// model provider serves, so only the manifest vouches for Codex, Claude, and Antigravity.
const MANIFEST_LABELS: ReadonlyMap<string, string> = new Map(
  Object.values(BUNDLED_MODEL_MANIFEST.providers ?? {}).flatMap((catalog) =>
    catalog.models.flatMap((model) =>
      [model.slug, ...(model.aliases ?? [])].map((name) => [name, model.slug] as const),
    ),
  ),
);
const REGISTRY_LABEL_DRIVERS: ReadonlySet<string> = new Set(["cursor", "grok"]);

/**
 * The vendor catalog slug that a native or routed model id names, such as
 * `anthropic/claude-opus-5-5` or a dated snapshot. Models outside the bundled
 * manifest and the Cursor and Grok catalogs, including user-added ones, return undefined.
 */
export function catalogModelLabel(
  providers: ReadonlyArray<ServerProvider>,
  model: string,
): string | undefined {
  const leaf = model.slice(model.lastIndexOf("/") + 1);
  const candidates = [model, leaf, leaf.replace(DATED_SNAPSHOT, "")];
  for (const candidate of candidates) {
    const label = MANIFEST_LABELS.get(candidate);
    if (label !== undefined) return label;
  }
  for (const provider of providers) {
    if (!REGISTRY_LABEL_DRIVERS.has(provider.driver)) continue;
    const match = provider.models.find(
      (entry) => !entry.isCustom && candidates.includes(entry.slug),
    );
    if (match !== undefined) return match.slug;
  }
  return undefined;
}
