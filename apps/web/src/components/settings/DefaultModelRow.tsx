import type { ModelSelection } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useNavigate } from "@tanstack/react-router";

import { useClientSettings } from "../../hooks/useSettings";
import {
  defaultModelSelectionsAreMixed,
  getCustomModelOptionsByInstance,
} from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { useEnvironmentProviders, useEnvironments } from "../../state/environments";
import { EMPTY_SERVER_PROVIDERS } from "../../state/server";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { TraitsPicker } from "../chat/TraitsPicker";
import { useComposerDraftStore } from "../../composerDraftStore";
import { toastManager } from "../ui/toast";
import { proposeModelFollow } from "../workbench/defaultModelFollow";
import { useEngineeringInterface } from "../workbench/studioInterface";
import { resolveDefaultModelSettingsPresentation } from "./ProjectDefaultsSettings.logic";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  SETTINGS_PICKER_TRIGGER_CLASSNAME,
  SettingResetButton,
  SettingsRow,
} from "./settingsLayout";
import { useScopedModelDisabledReason } from "./useScopedModelAvailability";
import {
  useScopedSettings,
  useScopedSettingSource,
  useUpdateScopedSettings,
} from "./useScopedSettings";

/**
 * The model new threads start on, with its Thinking and Speed choices: the one row that edits
 * `defaultModelSelection` at the scope Settings has selected (an environment's default, or a
 * project's override). General and Project settings show it under "New threads"; the engineering
 * interface, whose composer carries no model picker, shows it under AI agents instead. A change
 * applies to chats started afterwards; in the engineering interface the chat that was in front when
 * Settings opened also takes a chosen model on its next turn (`workbench/defaultModelFollow.ts`).
 * Resetting it is not applied to an open chat. There it also forgets the composer's remembered
 * pick, so new chats start on the built-in model (at project scope, on the environment default).
 */
export function DefaultModelRow() {
  const { scope, target, targets, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const clientSettings = useClientSettings();
  const updateSettings = useUpdateScopedSettings();
  const navigate = useNavigate();
  const engineering = useEngineeringInterface();
  const { environments } = useEnvironments();
  const providersByEnvironment = useEnvironmentProviders();
  const representative = target
    ? environments.find((environment) => environment.environmentId === target.environmentId)
    : undefined;
  const providers =
    (representative?.serverConfig
      ? providersByEnvironment.get(representative.environmentId)
      : undefined) ?? EMPTY_SERVER_PROVIDERS;
  const entries = providerInstanceEntriesFor(providers, settings, target?.projectId ?? null);
  const presentation = resolveDefaultModelSettingsPresentation({
    entries,
    providers,
    settings,
    projectId: target?.projectId ?? null,
  });
  const selection = presentation.selection;
  const modelOptions = getCustomModelOptionsByInstance(
    settings,
    providers,
    selection?.instanceId,
    selection?.model,
  );
  const activeEntry = entries.find((entry) => entry.instanceId === selection?.instanceId);
  const mixedModel = defaultModelSelectionsAreMixed(
    clientSettings,
    targets.map((candidate) => ({
      projectId: candidate.projectId,
      settings: candidate.settings,
      providers: providersByEnvironment.get(candidate.environmentId) ?? EMPTY_SERVER_PROVIDERS,
    })),
  );
  const automaticModel =
    targets.length > 0 &&
    targets.every((candidate) => candidate.settings.defaultModelSelection === null);
  const modelSource = useScopedSettingSource(["defaultModelSelection"]);
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const unavailable = connectedEnvironments.length === 0;

  const modelDisabledReason = useScopedModelDisabledReason(settings, entries);
  const effortDisabledReason = selection
    ? modelDisabledReason(selection.instanceId, selection.model)
    : null;

  const setModel = (value: ModelSelection | null) => {
    const reason = value ? modelDisabledReason(value.instanceId, value.model) : null;
    if (reason) {
      toastManager.add({ type: "error", title: "Default model not saved", description: reason });
      return;
    }
    updateSettings({ defaultModelSelection: value });
    // With no picker in the engineering composer, a remembered pick could only be stale: new
    // chats should start on the built-in model once the default is reset.
    if (engineering) {
      proposeModelFollow(value);
      if (value === null) useComposerDraftStore.getState().clearStickyModelSelection();
    }
  };

  return (
    <SettingsRow
      serverScoped
      settingKeys={["defaultModelSelection"]}
      mixed={mixedModel}
      id="default-model"
      title="Model"
      description={
        isProjectScope
          ? "Model for new threads in this project."
          : !unavailable && modelSource !== "project" && automaticModel
            ? "Default model for new threads, selected automatically. Projects can override it."
            : "Default model for new threads. Projects can override it."
      }
      status={
        mixedModel
          ? `${automaticModel ? "Automatic defaults differ." : "Defaults differ."} Select one environment or choose a shared model to edit effort.`
          : (presentation.providerNote ?? effortDisabledReason)
      }
      resetAction={
        settings.defaultModelSelection !== null ? (
          <SettingResetButton label="default model" onClick={() => setModel(null)} />
        ) : null
      }
      control={
        selection ? (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <ProviderModelPicker
              environmentId={representative?.environmentId ?? null}
              activeInstanceId={selection.instanceId}
              model={selection.model}
              lockedProvider={null}
              instanceEntries={entries}
              modelOptionsByInstance={modelOptions}
              triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
              {...(mixedModel
                ? { triggerLabel: automaticModel ? "Automatic (mixed)" : "Mixed" }
                : {})}
              getModelDisabledReason={modelDisabledReason}
              onOpenProviderSetup={(instanceId) => {
                if (representative)
                  void navigate({
                    to: "/settings/providers",
                    search: { environmentId: representative.environmentId, instanceId },
                  });
              }}
              onInstanceModelChange={(instanceId, model) =>
                setModel(createModelSelection(instanceId, model))
              }
            />
            {!mixedModel && !presentation.providerNote && !effortDisabledReason && activeEntry ? (
              <TraitsPicker
                provider={activeEntry.driverKind}
                models={activeEntry.models}
                model={selection.model}
                modelOptions={selection.options ?? []}
                allowPromptInjectedEffort={false}
                nameTrait={engineering}
                triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                onModelOptionsChange={(options) =>
                  setModel(createModelSelection(selection.instanceId, selection.model, options))
                }
              />
            ) : null}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {mixedModel ? "Mixed" : "No providers available"}
          </span>
        )
      }
    />
  );
}
