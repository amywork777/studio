import { describe, expect, it } from "vite-plus/test";

import { errorText, rebuildWords } from "./rebuildUnsaved.ts";

const refusal = (command: string) =>
  `linear_stage (acd7f82d) is not saved: the engine's cache holds no file of its last build; run \`${command}\` to build it again`;

describe("rebuildWords", () => {
  it("reads the command a restarted engine names for a model it no longer holds", () => {
    expect(rebuildWords(refusal("cad run /work/stage/assemblies/linear_stage.py"), false)).toEqual([
      "/work/stage/assemblies/linear_stage.py",
    ]);
    // shlex.quote: a path with a space, and one with a quote in it.
    expect(rebuildWords(refusal("cad run --with numpy '/work/my stage/a.py'"), false)).toEqual([
      "--with",
      "numpy",
      "/work/my stage/a.py",
    ]);
    expect(rebuildWords(refusal(`cad run '/work/Amy'"'"'s/a.py'`), false)).toEqual([
      "/work/Amy's/a.py",
    ]);
  });

  it("reads Windows' quoting, where a single quote is part of the path", () => {
    expect(rebuildWords(refusal(`cad run "C:\\Users\\Amy Z\\a.py"`), true)).toEqual([
      "C:\\Users\\Amy Z\\a.py",
    ]);
    expect(rebuildWords(refusal("cad run C:\\Amy's\\a.py"), true)).toEqual(["C:\\Amy's\\a.py"]);
    expect(rebuildWords(refusal(`cad run "C:\\my"%"20 dir\\a.py"`), true)).toEqual([
      "C:\\my%20 dir\\a.py",
    ]);
  });

  it("is null for any other refusal, and for a model built by a Python of its own", () => {
    expect(rebuildWords("No file at /work/a.step.", false)).toBeNull();
    expect(rebuildWords(refusal("/venv/bin/python /work/a.py"), false)).toBeNull();
    expect(
      rebuildWords(
        "a (b) is not saved: the engine's cache holds no file of its last hand-over, and it is shown; run that program again",
        false,
      ),
    ).toBeNull();
  });

  it("reads the refusal from a tool call's error result", () => {
    const result = { isError: true, content: [{ type: "text", text: refusal("cad run /a.py") }] };
    expect(rebuildWords(errorText(result), false)).toEqual(["/a.py"]);
    expect(errorText(null)).toBe("");
  });
});
