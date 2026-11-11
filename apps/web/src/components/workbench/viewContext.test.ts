import { describe, expect, it } from "vite-plus/test";

import { handEditNoteShown, readViewContext, viewImageName } from "./viewContext";

describe("view context", () => {
  it("splits what the viewer adds into composer text and pictures", () => {
    expect(
      readViewContext([
        { type: "text", text: "Make this hole 6 mm\n\nFile: /w/bracket.step" },
        {
          type: "image",
          data: "iVBO",
          mimeType: "image/png",
          _meta: { "openai/title": "CAD view · bracket.step" },
        },
        { type: "text", text: "  " },
        "junk",
      ]),
    ).toEqual({
      text: "Make this hole 6 mm\n\nFile: /w/bracket.step",
      images: [{ name: "cad-view-bracket-step.png", data: "iVBO", mimeType: "image/png" }],
      handEdit: false,
    });
  });

  it("knows a note of a hand edit from a request", () => {
    expect(
      readViewContext([
        {
          type: "text",
          text: "In edit mode I changed Wall thickness from 2 to 2.5.",
          _meta: { "openai/title": "Hand edit · bracket.py" },
        },
      ]).handEdit,
    ).toBe(true);
  });

  it("says what a hand-edit note is while the message box holds it", () => {
    const note = "In edit mode I added Boss-Extrude1, distance 10 mm (parts/tray.py, line 37).";
    expect(handEditNoteShown(`${note} and make it taller`, [note])).toBe(true);
    // Sent, or deleted by the person: nothing left to explain.
    expect(handEditNoteShown("", [note])).toBe(false);
    expect(handEditNoteShown("make it taller", [note])).toBe(false);
  });

  it("names an untitled picture by its place", () => {
    expect(viewImageName(undefined, 1)).toBe("view-2.png");
  });
});
