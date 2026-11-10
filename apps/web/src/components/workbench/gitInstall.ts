import type { ExecutionEnvironmentPlatformOs } from "@t3tools/contracts";

/**
 * How to get git onto the computer Studio's projects live on, for the person who has none:
 * the words around the one command there is to type. No command on Windows, where it is an
 * installer. Studio looks for git once, as it starts, so every route ends in a restart.
 */
export interface GitInstallSteps {
  readonly before: string;
  /** What to type in Terminal, the only part shown as code. */
  readonly command: string | null;
  readonly after: string;
}

const MAC_COMMAND = "xcode-select --install";

export function gitInstallSteps(os: ExecutionEnvironmentPlatformOs | undefined): GitInstallSteps {
  if (os === "darwin") {
    return {
      before: "Open Terminal and run ",
      command: MAC_COMMAND,
      after: ", then restart Studio.",
    };
  }
  if (os === "windows") {
    return { before: "Install Git for Windows, then restart Studio.", command: null, after: "" };
  }
  return {
    before: "On a Mac, open Terminal and run ",
    command: MAC_COMMAND,
    after: ". On Windows, install Git for Windows. Then restart Studio.",
  };
}
