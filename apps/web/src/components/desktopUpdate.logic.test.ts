import { describe, expect, it } from "vite-plus/test";
import type { DesktopUpdateState } from "@t3tools/contracts";

import {
  canCheckForUpdate,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateInstallConfirmationMessage,
  getDesktopUpdateRefusedInstallError,
  getDesktopUpdateReleaseHistoryUrl,
  getDesktopUpdateReleaseUrl,
  resolveDesktopUpdateButtonAction,
} from "./desktopUpdate.logic";

const baseState: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  channel: "latest",
  currentVersion: "1.0.0",
  hostArch: "x64",
  appArch: "x64",
  runningUnderArm64Translation: false,
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};

describe("desktop update button state", () => {
  it("keeps retry action available after a download error", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "error",
      availableVersion: "1.1.0",
      message: "network timeout",
      errorContext: "download",
      canRetry: true,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
    expect(getDesktopUpdateButtonTooltip(state)).toContain("Click to retry");
  });

  it("keeps install action available after a background updater error", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "error",
      downloadedVersion: "1.1.0",
      availableVersion: "1.1.0",
      message: "background updater error",
      errorContext: null,
      canRetry: true,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("install");
    expect(getDesktopUpdateButtonTooltip(state)).toContain(
      "installs when you quit, or click to restart now",
    );
  });

  it("prefers a newly available release over a stale downloaded version", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "available",
      availableVersion: "1.2.0",
      downloadedVersion: "1.1.0",
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
  });

  it("hides the install action while checking for a newer release", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "checking",
      availableVersion: "1.1.0",
      downloadedVersion: "1.1.0",
      downloadPercent: 100,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("none");
  });
});

describe("getDesktopUpdateRefusedInstallError", () => {
  it("says what to do when the download failed for lack of disk space", () => {
    expect(
      getDesktopUpdateRefusedInstallError({
        ...baseState,
        status: "error",
        errorContext: "download",
        downloadedVersion: "0.1.11",
        message: "You can’t save the file “a.zip” because there isn’t enough space.",
      }),
    ).toBe(
      "There isn't enough free disk space for the update. Free up about 2 GB, then click the update button again.",
    );
  });

  it("gives another failed download's own words, and none for an install that is only early", () => {
    expect(
      getDesktopUpdateRefusedInstallError({
        ...baseState,
        status: "error",
        errorContext: "download",
        message: "net::ERR_INTERNET_DISCONNECTED",
      }),
    ).toBe("net::ERR_INTERNET_DISCONNECTED");
    expect(getDesktopUpdateRefusedInstallError({ ...baseState, status: "downloading" })).toBeNull();
    expect(
      getDesktopUpdateRefusedInstallError({
        ...baseState,
        status: "error",
        errorContext: "install",
        message: "boom",
      }),
    ).toBeNull();
  });
});

describe("desktop update UI helpers", () => {
  it("builds the release URL on Studio's update feed", () => {
    expect(getDesktopUpdateReleaseUrl("0.0.30", undefined)).toBe(
      "https://github.com/amywork777/studio-download/releases/tag/v0.0.30",
    );
    expect(getDesktopUpdateReleaseHistoryUrl(undefined)).toBe(
      "https://github.com/amywork777/studio-download/releases",
    );
  });

  it.each(["owner/repo/extra", "owner#notes/repo", "owner/repo?tab=notes"])(
    "falls back to Studio's update feed for an invalid configured repository: %s",
    (repository) => {
      expect(getDesktopUpdateReleaseHistoryUrl(repository)).toBe(
        "https://github.com/amywork777/studio-download/releases",
      );
      expect(getDesktopUpdateReleaseUrl("1.2.3", repository)).toBe(
        "https://github.com/amywork777/studio-download/releases/tag/v1.2.3",
      );
    },
  );

  it("includes the downloaded version in the install confirmation copy", () => {
    expect(
      getDesktopUpdateInstallConfirmationMessage(
        { availableVersion: "1.1.0", downloadedVersion: "1.1.1" },
        0,
        "Studio",
      ),
    ).toBe("Install update 1.1.1 and restart Studio?");
    expect(
      getDesktopUpdateInstallConfirmationMessage(
        { availableVersion: null, downloadedVersion: null },
        0,
        "Studio",
      ),
    ).toBe("Install update and restart Studio?");
  });

  it("says the restart waits for the chats that are working", () => {
    const state = { availableVersion: "1.1.0", downloadedVersion: "1.1.0" };
    expect(getDesktopUpdateInstallConfirmationMessage(state, 1, "Studio")).toBe(
      "Install update 1.1.0 and restart Studio?\n\nStudio restarts when the chat that is working finishes.",
    );
    expect(getDesktopUpdateInstallConfirmationMessage(state, 3, "Studio")).toContain(
      "when the 3 chats that are working finish.",
    );
  });
});

describe("canCheckForUpdate", () => {
  it("returns true once an update has been downloaded so newer releases can be found", () => {
    expect(
      canCheckForUpdate({
        ...baseState,
        status: "downloaded",
        availableVersion: "1.1.0",
        downloadedVersion: "1.1.0",
      }),
    ).toBe(true);
  });
});
