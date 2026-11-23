import { describe, expect, it } from "vite-plus/test";

import { changeSentence, versionAround } from "./turnChange";

const version = (id: string, ref: string | null) => ({ id, ref, time: 0, blob: id });

describe("a turn's change in an engineer's words", () => {
  it("says what of the part changed, a document just updated", () => {
    expect(changeSentence({ aspects: ["model"] })).toBe("model updated");
    expect(changeSentence({ aspects: ["model", "drawing"] })).toBe("model and drawing updated");
    expect(changeSentence({ aspects: ["model", "drawing", "FEA study"] })).toBe(
      "model, drawing and FEA study updated",
    );
    expect(changeSentence({ aspects: [] })).toBe("updated");
  });

  it("finds the version the turn made and the one before it, numbered as Versions numbers them", () => {
    const versions = [version("a", "refs/t3/1"), version("b", "refs/t3/2"), version("c", null)];
    expect(versionAround(versions, "refs/t3/2")).toEqual({ newer: "b", older: "a", number: 2 });
    expect(versionAround(versions, "refs/t3/1")).toEqual({ newer: "a", older: null, number: 1 });
    expect(versionAround(versions, "refs/t3/9")).toBeNull();
  });
});
