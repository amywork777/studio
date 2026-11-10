import { describe, expect, it } from "vite-plus/test";

import { reportProblemUrl, STUDIO_NEW_ISSUE_URL } from "./reportProblem";

const bodyOf = (url: string) => {
  const parsed = new URL(url);
  expect(`${parsed.origin}${parsed.pathname}`).toBe(STUDIO_NEW_ISSUE_URL);
  return parsed.searchParams.get("body");
};

describe("reportProblemUrl", () => {
  it("fills in the version and the machine", () => {
    const body = bodyOf(
      reportProblemUrl({
        appName: "Studio",
        version: "0.1.5",
        textToCadVersion: "0.10.3",
        platform: { os: "darwin", arch: "arm64" },
      }),
    );
    expect(body?.endsWith("---\nStudio 0.1.5\ntext-to-cad: 0.10.3\nMachine: macOS (arm64)")).toBe(
      true,
    );
  });

  it("leaves text-to-cad out when there is none to name", () => {
    const body = bodyOf(
      reportProblemUrl({
        appName: "Studio",
        version: "0.1.5",
        textToCadVersion: null,
        platform: { os: "windows", arch: "other" },
      }),
    );
    expect(body?.endsWith("Machine: Windows")).toBe(true);
    expect(body).not.toContain("text-to-cad");
  });

  it("never names the usage id: the issue is public", () => {
    const body = bodyOf(
      reportProblemUrl({
        appName: "Studio",
        version: "0.1.5",
        textToCadVersion: "0.10.3",
        platform: { os: "darwin", arch: "arm64" },
      }),
    );
    expect(body).not.toMatch(/usage/i);
  });
});
