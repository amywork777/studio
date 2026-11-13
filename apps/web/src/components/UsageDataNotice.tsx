import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { APP_BASE_NAME } from "../branding";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { primaryServerConfigAtom, serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { toastManager } from "./ui/toast";

// Keep an active toast across remounts, including Strict Mode effect replay.
let shown = false;

/**
 * Tells the person once, before any usage counts are sent, what is sent and where to turn it off.
 * Being told is the answer (`usageDataAnswered`); a no from the old Share or Don't share notice stays
 * a no. Builds without a usage receiver never show it.
 */
export function UsageDataNotice() {
  const config = useAtomValue(primaryServerConfigAtom);
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "note the usage data notice",
  });
  const asking =
    config !== null &&
    environmentId !== null &&
    config.observability.usageDataAvailable &&
    config.settings.shareUsageData &&
    !config.settings.usageDataAnswered;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- shows the imperative notice toast once while the server says it is owed.
  useEffect(() => {
    // A no that Restore defaults has reopened is asked again, not only at the next launch.
    if (!asking) shown = false;
    if (!asking || shown || environmentId === null) return;
    shown = true;
    const told = (patch: { readonly shareUsageData?: boolean }) =>
      updateSettings({ environmentId, input: { patch: { usageDataAnswered: true, ...patch } } });
    const id = toastManager.add({
      title: `${APP_BASE_NAME} shares anonymous usage counts`,
      description:
        "Counts of which features get used and what fails, to decide what to fix and build next. Never your prompts, file names or designs. Turn it off here or in Settings → About, which also deletes what was sent.",
      timeout: 0,
      actionProps: { children: "OK", onClick: () => toastManager.close(id) },
      data: {
        actionLayout: "stacked-end",
        secondaryActionProps: {
          children: "Turn off",
          onClick: () => {
            toastManager.close(id);
            void told({ shareUsageData: false });
          },
        },
        secondaryActionVariant: "ghost",
      },
    });
    // Shown is told: nothing counted before this is sent, everything after is, until a Turn off.
    void told({});
  }, [asking, environmentId, updateSettings]);
  return null;
}
