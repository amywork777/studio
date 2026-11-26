import { useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, StudioDeliverablesInput } from "@t3tools/contracts";
import { useState } from "react";

import { toastManager } from "~/components/ui/toast";
import { serverEnvironment } from "~/state/server";
import { shellEnvironment } from "~/state/shell";
import { studioProjectsEnvironment } from "~/state/studioProjects";
import { useAtomCommand } from "~/state/use-atom-command";
import { folderLabel } from "./folderLabel";

/**
 * The Overview's Export (`deliverables.ts`): one press writes it, a toast says how it went, and
 * Show in Finder opens the zip. One at a time, as each export runs the CAD tools.
 */
export function useDeliverables(environmentId: EnvironmentId) {
  const pack = useAtomCommand(studioProjectsEnvironment.deliverablesPack, { reportFailure: false });
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: true });
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const reveals = serverConfig?.availableEditors.includes("file-manager") === true;
  const label = folderLabel(serverConfig?.environment.platform.os);
  const [busy, setBusy] = useState(false);
  const run = async (planAt: (now: Date) => StudioDeliverablesInput) => {
    if (busy) return;
    const plan = planAt(new Date());
    setBusy(true);
    const toastId = toastManager.add({
      type: "loading",
      title: "Exporting the project",
      description:
        plan.exports.length === 0
          ? "Gathering its files."
          : "Exporting each part with the CAD tools.",
      timeout: 0,
    });
    const result = await pack({ environmentId, input: plan });
    setBusy(false);
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      toastManager.update(toastId, {
        type: "error",
        title: "Could not export the project",
        description:
          failure instanceof Error ? failure.message : "The project's files are as they were.",
        timeout: 8_000,
      });
      return;
    }
    const { files, failed, zip } = result.value;
    const left = failed.length + plan.missing.length;
    toastManager.update(toastId, {
      type: failed.length > 0 ? "warning" : "success",
      title: "Exported",
      description: `${files.length} files in ${zip.split(/[\\/]/).pop()}${left === 0 ? "" : `, ${left} not in it`}.${plan.receipt === null ? "" : " RECEIPT.md says what was checked."}`,
      timeout: 10_000,
      ...(reveals
        ? {
            actionProps: {
              children: label,
              onClick: () =>
                void openInEditor({ environmentId, input: { cwd: zip, editor: "file-manager" } }),
            },
          }
        : {}),
    });
  };
  return { busy, run };
}
