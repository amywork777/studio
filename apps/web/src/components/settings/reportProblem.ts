import type { ExecutionEnvironmentPlatform } from "@t3tools/contracts";

/** Where a problem report goes: Studio's own issues, not T3 Code's. */
export const STUDIO_NEW_ISSUE_URL = "https://github.com/amywork777/studio/issues/new";

const OS_NAMES = { darwin: "macOS", windows: "Windows", linux: "Linux", unknown: "Unknown OS" };

/**
 * A new issue on Studio's tracker with what a fix needs already filled in: the version, the
 * text-to-cad it includes where it names one, and the machine. Never the usage id: the tracker is
 * public, and the id there would tie this machine's anonymous counts to a name.
 */
export function reportProblemUrl(input: {
  readonly appName: string;
  readonly version: string;
  readonly textToCadVersion: string | null;
  readonly platform: Pick<ExecutionEnvironmentPlatform, "os" | "arch"> | null;
}): string {
  const machine =
    input.platform === null
      ? "Unknown"
      : `${OS_NAMES[input.platform.os]}${input.platform.arch === "other" ? "" : ` (${input.platform.arch})`}`;
  const body = [
    "**What happened**",
    "",
    "",
    "**What you expected**",
    "",
    "",
    "---",
    `${input.appName} ${input.version}`,
    ...(input.textToCadVersion === null ? [] : [`text-to-cad: ${input.textToCadVersion}`]),
    `Machine: ${machine}`,
  ].join("\n");
  return `${STUDIO_NEW_ISSUE_URL}?${new URLSearchParams({ body }).toString()}`;
}
