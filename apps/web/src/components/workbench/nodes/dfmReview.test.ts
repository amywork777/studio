import { describe, expect, it } from "vite-plus/test";

// The Motor mount sample's own CNC review, as the dfm skill wrote it.
import SAMPLE from "../../../../../../studio-sample/motor-mount/docs/motor_plate_dfm.md?raw";
import { isReviewPath, parseReview, reviewOwner, reviewPathFor } from "./dfmReview";

describe("manufacturing reviews", () => {
  it("reads the sample's CNC review: what passes, and what is left to look at", () => {
    const review = parseReview("docs/motor_plate_dfm.md", SAMPLE);
    expect(review?.check).toBe("CNC machining");
    expect(review?.status).toBe("warnings");
    expect(review?.headline).toBe("3 to look at, 8 pass");
    expect(review?.issues.map((issue) => issue.summary)).toEqual([
      "Pilot bore: to review",
      "Outline edges: to review",
      "Hole and slot edges: to review",
    ]);
    expect(review?.issues[0]?.fix).toMatch(/^Under ISO 2768-m/);
  });

  it("fails on a failed finding, says what was not checked, and reads SendCutSend's marks", () => {
    const review = parseReview(
      "docs/bracket_sendcutsend.md",
      [
        "# Bracket: SendCutSend preflight",
        "",
        "| Check | Measured | Rule source | Status | Next edit |",
        "| --- | --- | --- | --- | --- |",
        "| Flange length | 3.1 mm | [specs](https://x) | ❌ fail | Lengthen the flange to 4 mm |",
        "| Hole to edge | 2 mm | Direct file inspection | ✅ pass | None |",
        "| Bend radius | n/a | specs | unverified | Confirm the material |",
      ].join("\n"),
    );
    expect(review?.check).toBe("SendCutSend");
    expect(review?.status).toBe("fix");
    expect(review?.headline).toBe("1 to fix, 1 to look at, 1 pass");
    expect(review?.issues).toEqual([
      { severity: "error", summary: "Flange length: fails", fix: "Lengthen the flange to 4 mm" },
      { severity: "warning", summary: "Bend radius: not checked", fix: "Confirm the material" },
    ]);
  });

  it("is no review without a result column, and passes when every finding does", () => {
    expect(
      parseReview(
        "checks/motor_plate_dfm_measure.md",
        "| Feature | Measured |\n| --- | --- |\n| A | 1 |",
      ),
    ).toBeNull();
    expect(
      parseReview("docs/a_dfm.md", "| Feature | Result |\n| --- | --- |\n| Walls | pass |")?.status,
    ).toBe("ready");
  });

  it("finds a review's part by its file name, and where a node's check saves its review", () => {
    const parts = [
      { id: "parts/motor_plate.step", script: "parts/motor_plate.py" },
      { id: "parts/motor.step", script: "parts/motor.py" },
    ];
    expect(reviewOwner("docs/motor_plate_dfm.md", parts)).toBe("parts/motor_plate.step");
    expect(reviewOwner("docs/motor_dfm.md", parts)).toBe("parts/motor.step");
    expect(reviewOwner("docs/bracket_dfm.md", parts)).toBeNull();
    expect(reviewPathFor("parts/motor_plate.py", "sheet-metal")).toBe(
      "docs/motor_plate_sheet_metal_dfm.md",
    );
    expect(isReviewPath(reviewPathFor("parts/motor_plate.py", "sendcutsend"))).toBe(true);
  });
});
