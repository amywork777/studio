import type { ProjectId, ProviderInstanceId, ServerConfig } from "@t3tools/contracts";
import {
  type LegacyProjectSettingsFields,
  resolveProjectSettings,
} from "@t3tools/shared/projectSettings";

import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "~/providerInstances";
import { hasProviderSetup } from "../chat/ProviderStatusBanner";
import { resolveComposerProviderSelection } from "../ChatView.logic";

/** No AI agent can take a message: the one Settings opens at, when one can be set up. */
export interface MissingAgent {
  readonly setup: ProviderInstanceId | undefined;
}

/**
 * Whether a new chat would have no AI agent to send to, worked out as that chat's box works it
 * out (`resolveComposerProviderSelection`: none signed in, installed and turned on), for Home's
 * Start to say so before it makes a project. `project` is the one the chat would be in, null for a
 * new one. Null when an agent can take it, and while the agents are not known yet (`config` null).
 */
export function missingAgent(
  config: Pick<ServerConfig, "providers" | "settings"> | null,
  project: (LegacyProjectSettingsFields & { readonly id: ProjectId }) | null,
): MissingAgent | null {
  if (config === null) return null;
  const entries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(
      deriveProviderInstanceEntries(config.providers),
      config.settings,
      project?.id ?? null,
    ),
  );
  const { selectedProviderEntry, unavailableProviderInstanceId } = resolveComposerProviderSelection(
    {
      entries,
      candidateInstanceIds: [
        resolveProjectSettings(config.settings, project?.id ?? null, project).settings
          .defaultModelSelection?.instanceId,
      ],
      lockedProvider: null,
      lockedInstanceId: undefined,
    },
  );
  if (selectedProviderEntry !== undefined) return null;
  return {
    setup:
      unavailableProviderInstanceId ??
      entries.find((entry) => hasProviderSetup(entry.snapshot))?.instanceId,
  };
}
