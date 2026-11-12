import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import { ArrowRightIcon } from "lucide-react";

import {
  getDesktopUpdateActionError,
  getDesktopUpdateDownloadedVersion,
  getDesktopUpdateRefusedInstallError,
  getDesktopUpdateReleaseUrl,
} from "./desktopUpdate.logic";
import { stackedThreadToast, toastManager } from "./ui/toast";

type DesktopUpdateShell = Pick<DesktopBridge, "openExternal">;

export async function openDesktopUpdateReleaseNotes(
  shell: DesktopUpdateShell | undefined,
  releaseUrl: string,
): Promise<void> {
  try {
    if (shell && (await shell.openExternal(releaseUrl))) return;
  } catch {
    // Surface rejected IPC calls through the same user-visible fallback.
  }
  toastManager.add({ type: "error", title: "Unable to open release notes" });
}

function ReleaseNotesLink({
  shell,
  releaseUrl,
}: {
  shell: DesktopUpdateShell;
  releaseUrl: string;
}) {
  return (
    <button
      className="ml-2 inline cursor-pointer text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
      onClick={() => {
        void openDesktopUpdateReleaseNotes(shell, releaseUrl);
      }}
      type="button"
    >
      Read more
      <ArrowRightIcon
        aria-hidden
        className="ml-1 inline size-3 -rotate-45 align-[-0.125em]"
        strokeWidth={2.25}
      />
    </button>
  );
}

export function showDesktopUpdateDownloadedToast(
  shell: DesktopUpdateShell,
  state: DesktopUpdateState,
): void {
  const releaseUrl = getDesktopUpdateReleaseUrl(getDesktopUpdateDownloadedVersion(state));
  toastManager.add({
    type: "success",
    title: "Update downloaded",
    description: (
      <>
        Restart the app from the update button to install it.
        {releaseUrl ? <ReleaseNotesLink releaseUrl={releaseUrl} shell={shell} /> : null}
      </>
    ),
  });
}

const installFailed = (description: string) =>
  toastManager.add(
    stackedThreadToast({ type: "error", title: "Could not install update", description }),
  );

/** Installs this app's downloaded update, which relaunches the app: the one way the sidebar,
    Settings and the legacy sidebar install. A refused install says why when its download failed
    (`getDesktopUpdateRefusedInstallError`), else leaves the restart to the update button; a failed
    one says what failed. */
export async function installDesktopUpdate(bridge: DesktopBridge): Promise<void> {
  try {
    const result = await bridge.installUpdate();
    if (!result.accepted) {
      const refused = getDesktopUpdateRefusedInstallError(result.state);
      if (refused) installFailed(refused);
      else showDesktopUpdateDownloadedToast(bridge, result.state);
      return;
    }
    const actionError = getDesktopUpdateActionError(result);
    if (actionError) installFailed(actionError);
  } catch (error) {
    installFailed(error instanceof Error ? error.message : "An unexpected error occurred.");
  }
}
