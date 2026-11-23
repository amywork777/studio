import { describe, expect, it } from "vite-plus/test";

import { viewContextLabel, viewMessageOf } from "./viewMessage";

const QUICK_EDIT = [
  "make this face 2 mm thinner",
  "",
  "File: 29ae9a38-16fc-587c-b9ea-7a4fc571762e",
  "References:",
  "29ae9a38-16fc-587c-b9ea-7a4fc571762e#led_module/f:led_module.body_face3~ee2f;Gf:led_module.body",
  "Snapshot JSON (cad model snapshot --annotation): {}",
].join("\n");

describe("a message the model view sent", () => {
  it("shows the person's words and keeps what it is about for the chip", () => {
    expect(viewMessageOf(QUICK_EDIT)).toEqual({
      words: "make this face 2 mm thinner",
      about: QUICK_EDIT.slice(QUICK_EDIT.indexOf("File:")),
      label: "LED module · 1 face",
    });
  });

  it("names the picks by part and kind, and a file alone as the model view", () => {
    const two = "References:\nx#part/f:part.body_face1~a\nx#part/f:part.body_face2~b";
    expect(viewContextLabel(two)).toBe("Part · 2 faces");
    expect(
      viewContextLabel("References:\nx#arm/e:arm.body_edge4~c\nx#arm/f:arm.body_face1~d"),
    ).toBe("Arm · 2 picks");
    expect(viewContextLabel("File: 29ae9a38\nSnapshot JSON (cad model snapshot): {}")).toBe(
      "Model view",
    );
  });

  it("reads a send with no words of its own, and leaves a message typed in the chat alone", () => {
    expect(viewMessageOf("File: bracket.step")?.words).toBe("");
    expect(viewMessageOf("Make the File: line bold")).toBeNull();
    expect(viewMessageOf("make the wall 3 mm")).toBeNull();
  });
});
