import { describe, expect, it } from "vite-plus/test";

import { gitInstallSteps } from "./gitInstall";

const said = (os: Parameters<typeof gitInstallSteps>[0]) => {
  const steps = gitInstallSteps(os);
  return `${steps.before}${steps.command ?? ""}${steps.after}`;
};

describe("gitInstallSteps", () => {
  it("gives a Mac the one command to run in Terminal", () => {
    expect(gitInstallSteps("darwin").command).toBe("xcode-select --install");
    expect(said("darwin")).toBe(
      "Open Terminal and run xcode-select --install, then restart Studio.",
    );
  });

  it("gives Windows the installer and no command", () => {
    expect(gitInstallSteps("windows").command).toBeNull();
    expect(said("windows")).toBe("Install Git for Windows, then restart Studio.");
  });

  it("says both when the computer is neither or not known yet", () => {
    for (const os of ["linux", "unknown", undefined] as const) {
      expect(said(os)).toBe(
        "On a Mac, open Terminal and run xcode-select --install. On Windows, install Git for Windows. Then restart Studio.",
      );
    }
  });

  it("keeps to plain words", () => {
    for (const os of ["darwin", "windows", "linux", "unknown", undefined] as const) {
      expect(said(os)).not.toMatch(/repositor|commit|push|branch|pull request|merge|—|–/iu);
    }
  });
});
