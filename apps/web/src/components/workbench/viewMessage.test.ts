import { describe, expect, it } from "vite-plus/test";

import { pickWords, viewContextLabel, viewContextOf, viewMessageOf } from "./viewMessage";

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

  it("names every part picked in an assembly once, by its own name, with the picks and the file", () => {
    const about = [
      "File: desk_lamp.step",
      "References:",
      "d#arm_assembly/arm<1>",
      "d#arm_assembly/head_assembly/head<1>/f:head.body_face2~a",
      "d#arm_assembly/head_assembly/head<1>/f:head.body_face5~b",
      "d#base<1>",
    ].join("\n");
    expect(viewContextOf(about)).toEqual({
      parts: ["Arm", "Head", "Base"],
      count: "4 picks",
      picks: [
        "d#arm_assembly/arm<1>",
        "d#arm_assembly/head_assembly/head<1>/f:head.body_face2~a",
        "d#arm_assembly/head_assembly/head<1>/f:head.body_face5~b",
        "d#base<1>",
      ],
      file: "desk_lamp.step",
    });
    expect(viewContextLabel(about)).toBe("Arm, Head, Base · 4 picks");
    expect(viewContextOf(about).picks.map(pickWords)).toEqual([
      "Arm",
      "Head, face 2",
      "Head, face 5",
      "Base",
    ]);
  });

  it("reads a send with no words of its own, and leaves a message typed in the chat alone", () => {
    expect(viewMessageOf("File: bracket.step")?.words).toBe("");
    expect(viewMessageOf("Make the File: line bold")).toBeNull();
    expect(viewMessageOf("make the wall 3 mm")).toBeNull();
  });
});
