import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  type EnvironmentId,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
} from "@t3tools/contracts";

import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { buildProviderInstanceUpdatePatch } from "../settings/SettingsPanels.logic";

/**
 * A provider instance as saved, and a way to save it changed, for Studio's own rows that set one
 * up (an invite code, Studio Pro). Save answers an error sentence, or null.
 */
export function useProviderInstance(
  environmentId: EnvironmentId,
  instanceId: ProviderInstanceId,
  driver: string,
  label: string,
) {
  const settings = useAtomValue(serverEnvironment.configValueAtom(environmentId))?.settings;
  const update = useAtomCommand(serverEnvironment.updateSettings, {
    label,
    reportFailure: false,
    reportDefect: false,
  });
  const instance: ProviderInstanceConfig = settings?.providerInstances[instanceId] ?? {
    driver: ProviderDriverKind.make(driver),
  };
  const save = async (next: ProviderInstanceConfig) => {
    if (!settings) return "Studio is still connecting. Try again in a moment.";
    const result = await update({
      environmentId,
      input: { patch: buildProviderInstanceUpdatePatch({ settings, instanceId, instance: next }) },
    });
    if (result._tag === "Success" || isAtomCommandInterrupted(result)) return null;
    const failure = squashAtomCommandFailure(result);
    return failure instanceof Error ? failure.message : "Could not save. Try again.";
  };
  return { instance, save };
}
