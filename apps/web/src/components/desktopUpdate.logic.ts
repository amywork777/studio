import type { DesktopUpdateActionResult, DesktopUpdateState } from "@t3tools/contracts";
import { msg } from "gt-react";

import { m, type MessageResolver } from "../i18n/messages";

export type DesktopUpdateButtonAction = "download" | "install" | "none";

/** Studio's update feed (`STUDIO_UPDATE_FEED`), whose releases hold the notes. */
const DEFAULT_DESKTOP_RELEASE_REPOSITORY = "amywork777/studio-download";
const GITHUB_REPOSITORY_SEGMENT = /^[A-Za-z0-9._-]+$/u;

function isValidRepositorySegment(value: string | undefined): value is string {
  return (
    value !== undefined && value !== "." && value !== ".." && GITHUB_REPOSITORY_SEGMENT.test(value)
  );
}

function desktopReleaseRepositoryUrl(repository: string | undefined): string {
  const configuredRepository = repository?.trim() ?? "";
  const [owner, name, ...extra] = configuredRepository.split("/");
  const releaseRepository =
    isValidRepositorySegment(owner) && isValidRepositorySegment(name) && extra.length === 0
      ? configuredRepository
      : DEFAULT_DESKTOP_RELEASE_REPOSITORY;
  return `https://github.com/${releaseRepository}/releases`;
}

/** The download RPC can beat the updater's downloadedVersion event; fall back to the requested version. */
export function getDesktopUpdateDownloadedVersion(state: DesktopUpdateState): string | null {
  return state.downloadedVersion ?? state.availableVersion;
}

export function getDesktopUpdateReleaseUrl(
  version: string | null,
  repository: string | undefined = import.meta.env.T3CODE_DESKTOP_UPDATE_REPOSITORY,
): string | null {
  const normalizedVersion = version?.trim();
  if (!normalizedVersion) return null;
  return `${desktopReleaseRepositoryUrl(repository)}/tag/v${encodeURIComponent(normalizedVersion)}`;
}

export function getDesktopUpdateReleaseHistoryUrl(
  repository: string | undefined = import.meta.env.T3CODE_DESKTOP_UPDATE_REPOSITORY,
): string {
  return desktopReleaseRepositoryUrl(repository);
}

export function resolveDesktopUpdateButtonAction(
  state: DesktopUpdateState,
): DesktopUpdateButtonAction {
  if (
    state.downloadedVersion &&
    (state.status === "downloaded" ||
      (state.status === "error" &&
        (state.errorContext === null || state.errorContext === "install")))
  ) {
    return "install";
  }
  if (state.status === "available") {
    return "download";
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return "download";
    }
  }
  return "none";
}

export function shouldShowArm64IntelBuildWarning(state: DesktopUpdateState | null): boolean {
  return state?.hostArch === "arm64" && state.appArch === "x64";
}

export function isDesktopUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  return state?.status === "downloading";
}

export function getArm64IntelBuildWarningDescription(
  state: DesktopUpdateState,
  resolve: MessageResolver = m,
): string {
  if (!shouldShowArm64IntelBuildWarning(state)) {
    return resolve(msg("This install is using the correct architecture."));
  }

  const action = resolveDesktopUpdateButtonAction(state);
  if (action === "download") {
    return resolve(
      msg(
        "This Mac has Apple Silicon, but T3 Code is still running the Intel build under Rosetta. Download the available update to switch to the native Apple Silicon build.",
      ),
    );
  }
  if (action === "install") {
    return resolve(
      msg(
        "This Mac has Apple Silicon, but T3 Code is still running the Intel build under Rosetta. Restart to install the downloaded Apple Silicon build.",
      ),
    );
  }
  return resolve(
    msg(
      "This Mac has Apple Silicon, but T3 Code is still running the Intel build under Rosetta. The next app update will replace it with the native Apple Silicon build.",
    ),
  );
}

// The desktop app downloads updates by itself and installs them when it quits
// (DesktopUpdates.ts), so a downloaded update needs no click, only offers one.
function downloadedTooltip(version: string | null, resolve: MessageResolver): string {
  return version === null
    ? resolve(msg("Update ready downloaded. It installs when you quit, or click to restart now."))
    : resolve(
        msg("Update {version} downloaded. It installs when you quit, or click to restart now.", {
          version,
        }),
      );
}

export function getDesktopUpdateButtonTooltip(
  state: DesktopUpdateState,
  resolve: MessageResolver = m,
): string {
  if (
    state.notAppliedVersion !== undefined &&
    (state.status === "available" || state.status === "downloaded") &&
    getDesktopUpdateDownloadedVersion(state) === state.notAppliedVersion
  ) {
    return resolve(
      msg("Update {version} did not apply. Click to retry.", { version: state.notAppliedVersion }),
    );
  }
  if (
    (state.status === "available" || state.status === "error") &&
    state.errorContext === "download" &&
    state.availableVersion
  ) {
    return resolve(
      msg("Download failed for {version}. Click to retry.", { version: state.availableVersion }),
    );
  }
  if (state.status === "available") {
    return state.availableVersion === null
      ? resolve(msg("Update available ready to download"))
      : resolve(msg("Update {version} ready to download", { version: state.availableVersion }));
  }
  if (state.status === "downloading") {
    return typeof state.downloadPercent === "number"
      ? resolve(
          msg("Downloading update ({percent}%)", { percent: Math.floor(state.downloadPercent) }),
        )
      : resolve(msg("Downloading update"));
  }
  if (state.status === "downloaded") {
    return downloadedTooltip(state.downloadedVersion ?? state.availableVersion, resolve);
  }
  if (state.status === "error") {
    if (state.errorContext === "install" && state.downloadedVersion) {
      return resolve(
        msg("Install failed for {version}. Click to retry.", { version: state.downloadedVersion }),
      );
    }
    if (state.downloadedVersion) {
      return downloadedTooltip(state.downloadedVersion, resolve);
    }
    return state.message ?? resolve(msg("Update failed"));
  }
  return resolve(msg("Up to date"));
}

/**
 * The question before restarting for an update. `running` is how many of this machine's chats are
 * working: the restart waits for them (`desktopUpdate.hold.ts`), and the question says so.
 */
export function getDesktopUpdateInstallConfirmationMessage(
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
  running: number,
  appName: string,
  resolve: MessageResolver = m,
): string {
  const version = state.downloadedVersion ?? state.availableVersion;
  const install = version
    ? resolve(msg("Install update {version} and restart {app}?", { version, app: appName }))
    : resolve(msg("Install update and restart {app}?", { app: appName }));
  return running === 0
    ? install
    : resolve(
        msg("{install}\n\n{app} restarts when {waiting}.", {
          install,
          app: appName,
          waiting: chatsWorking(running),
        }),
      );
}

/** "the chat that is working finishes", or "the 3 chats that are working finish". */
export const chatsWorking = (count: number) =>
  count === 1 ? "the chat that is working finishes" : `the ${count} chats that are working finish`;

export function getDesktopUpdateActionError(result: DesktopUpdateActionResult): string | null {
  if (!result.accepted || result.completed) return null;
  if (typeof result.state.message !== "string") return null;
  const message = result.state.message.trim();
  return message.length > 0 ? message : null;
}

/**
 * Why an install was refused, when its download failed: the download's own words, or, for a disk
 * with no room (the download's usual failure), what to do about it. Null for a refusal that is only
 * early (the download not marked ready yet), which the downloaded toast answers.
 */
export function getDesktopUpdateRefusedInstallError(
  state: DesktopUpdateState,
  resolve: MessageResolver = m,
): string | null {
  if (state.status !== "error" || state.errorContext === "install") return null;
  const message = state.message?.trim() ?? "";
  if (/enough space|ENOSPC|no space left/i.test(message)) {
    return resolve(
      msg(
        "There isn't enough free disk space for the update. Free up about 2 GB, then click the update button again.",
      ),
    );
  }
  return message.length > 0
    ? message
    : resolve(msg("The update did not finish downloading. Click the update button to try again."));
}

export function shouldToastDesktopUpdateActionResult(result: DesktopUpdateActionResult): boolean {
  return getDesktopUpdateActionError(result) !== null;
}

export function canCheckForUpdate(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) return false;
  return (
    state.status !== "checking" && state.status !== "downloading" && state.status !== "disabled"
  );
}

/** `managedDenial` is this machine's policy refusing updates (`managedUpdatesDenial`); it wins. */
export function getDesktopUpdateDisabledReason(
  state: Pick<DesktopUpdateState, "enabled" | "status" | "message"> | null,
  managedDenial?: string,
  resolve: MessageResolver = m,
): string | null {
  if (managedDenial !== undefined) return managedDenial;
  if (!state || (state.enabled && state.status !== "disabled")) return null;
  return (
    state.message?.trim() || resolve(msg("Automatic updates are not available in this build."))
  );
}

export function getDesktopUpdateIdleTooltip(
  state: Pick<DesktopUpdateState, "enabled" | "status" | "message"> | null,
  managedDenial?: string,
  resolve: MessageResolver = m,
) {
  const disabledReason = getDesktopUpdateDisabledReason(state, managedDenial, resolve);
  return disabledReason
    ? { title: resolve(msg("Updates unavailable")), detail: disabledReason }
    : { title: resolve(msg("Check for updates")), detail: null };
}
