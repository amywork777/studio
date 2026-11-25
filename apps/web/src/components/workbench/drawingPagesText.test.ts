import { describe, expect, it } from "vite-plus/test";

import { calloutsOf, pagePictureName, pictureScale, runFromMatrix } from "./drawingPagesText";

const PAGE = { width: 1000, height: 500 };
const run = (text: string, x: number, baseline: number, width: number) =>
  runFromMatrix(text, [10, 0, 0, -10, x, baseline], width);

describe("calloutsOf", () => {
  it("groups a dual-dimensioned limit stack into one callout and keeps others apart", () => {
    const callouts = calloutsOf(
      [
        run("0.752", 100, 110, 30),
        run("0.748", 100, 122, 30),
        run("[19.10]", 134, 110, 40),
        run("TYP.", 600, 300, 25),
        run(" ", 700, 300, 5),
      ],
      PAGE,
    );
    expect(callouts).toEqual([
      { text: "0.752 [19.10]\n0.748", box: [0.1, 0.2, 0.074, 0.044] },
      { text: "TYP.", box: [0.6, 0.58, 0.025, 0.02] },
    ]);
  });

  it("boxes text that runs up the sheet by where it is drawn", () => {
    // Rotated 90° counter-clockwise: the baseline runs up the page.
    const [callout] = calloutsOf([runFromMatrix("16 [.4]", [0, -10, -10, 0, 200, 300], 40)], PAGE);
    expect(callout).toEqual({ text: "16 [.4]", box: [0.19, 0.52, 0.01, 0.08], angle: 90 });
  });
});

describe("page pictures", () => {
  it("names pages so they sort, and keeps a large sheet under 5000 pixels", () => {
    expect(pagePictureName(3, 9)).toBe("page-03.png");
    expect(pagePictureName(3, 120)).toBe("page-003.png");
    expect(pictureScale(612, 792) * 792).toBeCloseTo(2200);
    expect(pictureScale(2592, 1728) * 2592).toBeCloseTo(5000);
  });
});
