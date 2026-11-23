import { describe, expect, it } from "vite-plus/test";

import { keepStudioCadFirst, studioCadFirstPath } from "./studioCadPath.ts";

const LAUNCHER = "/Users/a/.text-to-cad-studio/bin";

describe("Studio's own cad first on PATH", () => {
  it("puts Studio's cad folder ahead of a person's own cad that their profile put first", () => {
    const shell = `/Users/a/.local/bin:/usr/bin:${LAUNCHER}:/bin`;
    expect(studioCadFirstPath(shell, LAUNCHER, "darwin")).toBe(
      `${LAUNCHER}:/Users/a/.local/bin:/usr/bin:/bin`,
    );
  });

  it("names the folder once, with or without a trailing slash, and keeps PATH as it is without a launcher", () => {
    expect(studioCadFirstPath(`${LAUNCHER}/:/bin:${LAUNCHER}`, LAUNCHER, "linux")).toBe(
      `${LAUNCHER}:/bin`,
    );
    expect(studioCadFirstPath("/bin:/usr/bin", undefined, "darwin")).toBe("/bin:/usr/bin");
    expect(studioCadFirstPath("/bin", " ", "darwin")).toBe("/bin");
  });

  it("on Windows splits on ; and matches the folder whatever its case", () => {
    const launcher = "C:\\Users\\a\\.text-to-cad-studio\\bin";
    expect(
      studioCadFirstPath(
        "C:\\Users\\a\\.local\\bin;c:\\users\\a\\.text-to-cad-studio\\bin\\;C:\\Windows",
        launcher,
        "win32",
      ),
    ).toBe(`${launcher};C:\\Users\\a\\.local\\bin;C:\\Windows`);
  });

  it("rewrites the environment's PATH in place, one spelling on Windows", () => {
    const posix: NodeJS.ProcessEnv = {
      PATH: "/Users/a/.local/bin:/bin",
      CAD_LAUNCHER_DIR: LAUNCHER,
    };
    keepStudioCadFirst(posix, "darwin");
    expect(posix.PATH).toBe(`${LAUNCHER}:/Users/a/.local/bin:/bin`);

    const windows: NodeJS.ProcessEnv = { Path: "C:\\Windows", CAD_LAUNCHER_DIR: "C:\\s\\bin" };
    keepStudioCadFirst(windows, "win32");
    expect(windows).toEqual({ PATH: "C:\\s\\bin;C:\\Windows", CAD_LAUNCHER_DIR: "C:\\s\\bin" });

    const plain: NodeJS.ProcessEnv = { PATH: "/bin" };
    keepStudioCadFirst(plain, "darwin");
    expect(plain).toEqual({ PATH: "/bin" });
  });
});
