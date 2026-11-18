import { describe, expect, it } from "vite-plus/test";

import { partLink } from "./partLink";

const DOCUMENT = "6f1c0d8e-2b7a-4c1e-9d3f-5a6b7c8d9e0f";
const scripts = new Map([[DOCUMENT, "/work/servo bracket/parts/horn_adapter.py"]]);

describe("a part's link in a job's message", () => {
  it("names a model and links its script, never its id", () => {
    const link = partLink({ path: DOCUMENT, name: "Horn adapter" }, (id) => scripts.get(id));
    expect(link).toBe("[Horn adapter](/work/servo%20bracket/parts/horn_adapter.py)");
    expect(link).not.toContain(DOCUMENT);
  });

  it("names a model whose script is not known yet, and still no id", () => {
    expect(partLink({ path: DOCUMENT, name: "Horn adapter" }, () => undefined)).toBe(
      "Horn adapter",
    );
    expect(partLink({ path: DOCUMENT }, () => undefined)).toBe("the part");
  });

  it("links a file as ever, by its own name", () => {
    expect(partLink({ path: "parts/STEP/l_bracket.step", name: "L bracket" })).toBe(
      "[l\\_bracket.step](parts/STEP/l_bracket.step)",
    );
  });
});
