import { describe, expect, it } from "vite-plus/test";

import { buildErrorLine } from "./buildErrorLine";

describe("buildErrorLine", () => {
  it("keeps the error and drops the line of code before it", () => {
    expect(buildErrorLine("part.py: w = widht * 2 NameError: name 'widht' is not defined")).toBe(
      "part.py: NameError: name 'widht' is not defined",
    );
    expect(buildErrorLine('part.py: raise ValueError("too thin") ValueError: too thin')).toBe(
      "part.py: ValueError: too thin",
    );
    expect(buildErrorLine("part.py: x = = 3 SyntaxError: invalid syntax")).toBe(
      "part.py: SyntaxError: invalid syntax",
    );
  });

  it("reads an error from a module, and one with no message", () => {
    expect(
      buildErrorLine(
        "part.py: data = json.loads(text) json.decoder.JSONDecodeError: Expecting value",
      ),
    ).toBe("part.py: json.decoder.JSONDecodeError: Expecting value");
    expect(buildErrorLine("part.py: assert wall > 0 AssertionError")).toBe(
      "part.py: AssertionError",
    );
    expect(buildErrorLine("part.py: raise SystemExit SystemExit")).toBe("part.py: SystemExit");
  });

  it("keeps the whole message of an error that names another", () => {
    expect(
      buildErrorLine("part.py: load(path) RuntimeError: could not load: FileNotFoundError: a.step"),
    ).toBe("part.py: RuntimeError: could not load: FileNotFoundError: a.step");
  });

  it("takes the last line of a traceback given whole", () => {
    expect(
      buildErrorLine(
        "part.py: Traceback (most recent call last):\n  File \"/p/parts/part.py\", line 14, in part\n    w = widht * 2\nNameError: name 'widht' is not defined\n",
      ),
    ).toBe("part.py: NameError: name 'widht' is not defined");
  });

  it("leaves a reason with no Python error in it as it is", () => {
    for (const reason of [
      "part.py: the build failed",
      "The part took too long to build.",
      "Studio's CAD service did not answer.",
      "",
    ]) {
      expect(buildErrorLine(reason)).toBe(reason);
    }
  });
});
