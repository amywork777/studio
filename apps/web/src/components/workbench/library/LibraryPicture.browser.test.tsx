import { BoxIcon } from "lucide-react";
import { describe, expect, it } from "vite-plus/test";

import { act, render } from "../../../../test/render";
import { DocumentSheet, PictureOrGlyph } from "./LibraryPicture";

/** Far below the viewport, so the lazy picture never loads and only the test settles it. */
function offscreen() {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.top = "100000px";
  return container;
}

const glyphOf = (container: HTMLElement) => container.querySelector("svg");
const pictureOf = (container: HTMLElement) => container.querySelector("img");

describe("PictureOrGlyph", () => {
  it("holds the box with the glyph until the picture has loaded", async () => {
    await using screen = await render(<PictureOrGlyph url="/part.webp" icon={BoxIcon} />, {
      container: offscreen(),
    });
    expect(glyphOf(screen.container)).not.toBeNull();

    await act(() => pictureOf(screen.container)!.dispatchEvent(new Event("load")));

    expect(glyphOf(screen.container)).toBeNull();
    expect(pictureOf(screen.container)).not.toBeNull();
  });

  it("keeps the glyph when the picture cannot load", async () => {
    await using screen = await render(<PictureOrGlyph url="/part.webp" icon={BoxIcon} />, {
      container: offscreen(),
    });

    await act(() => pictureOf(screen.container)!.dispatchEvent(new Event("error")));

    expect(glyphOf(screen.container)).not.toBeNull();
    expect(pictureOf(screen.container)).toBeNull();
  });
});

describe("DocumentSheet", () => {
  it("draws a document's lines as bars, with no words to read as a second title", async () => {
    const text = "# Fit and clearance\n\nChecked the mount's model.\n<img src='a.png'>\nAll clear.";
    await using screen = await render(<DocumentSheet text={text} />);

    const sheet = screen.container.querySelector("svg");
    expect(sheet?.textContent).toBe("");
    // The sheet, then a bar for each of its three lines.
    expect(sheet?.children).toHaveLength(4);
  });
});
