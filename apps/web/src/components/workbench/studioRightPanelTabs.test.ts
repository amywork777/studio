import { describe, expect, it } from "vite-plus/test";

import type { RightPanelSurface } from "~/rightPanelStore";
import { tabFilePath, tabOffersCopyPath, titleParts } from "./studioRightPanelTabs";

describe("Copy path on a tab", () => {
  it("is offered on a file tab outside the engineering interface only", () => {
    const file = { kind: "file" } as const;
    expect(tabOffersCopyPath(file, false)).toBe(true);
    expect(tabOffersCopyPath(file, true)).toBe(false);
  });

  it("is never offered on an attachment or on a tab that is not a file", () => {
    expect(tabOffersCopyPath({ kind: "file", attachment: {} }, false)).toBe(false);
    expect(tabOffersCopyPath({ kind: "preview" }, false)).toBe(false);
  });
});

describe("a file tab's file on disk, for Show in Finder", () => {
  const view = (file?: string, id = "plugin:cad:view") =>
    ({ id, kind: "plugin-app", file }) as unknown as RightPanelSurface;

  it("is the view's workspace file under the project's folder, on a Mac and on Windows", () => {
    expect(tabFilePath(view("parts/bracket.step"), "/Users/amy/Studio/bracket")).toBe(
      "/Users/amy/Studio/bracket/parts/bracket.step",
    );
    expect(tabFilePath(view("parts\\bracket.step"), "C:\\Users\\amy\\Studio\\bracket\\")).toBe(
      "C:\\Users\\amy\\Studio\\bracket\\parts\\bracket.step",
    );
    // An agent's view names its file in its id; an absolute one stays as it is.
    expect(tabFilePath(view(undefined, "plugin:cad:agent:%2Ftmp%2Fa.step"), null)).toBe(
      "/tmp/a.step",
    );
  });

  it("is none for a tab with no file, an attachment, or a relative file with no project folder", () => {
    expect(tabFilePath(view(), "/p")).toBeNull();
    expect(tabFilePath(view("a.step"), null)).toBeNull();
    expect(
      tabFilePath(
        { kind: "file", relativePath: "a.step", attachment: {} } as unknown as RightPanelSurface,
        "/p",
      ),
    ).toBeNull();
  });
});

describe("a tab's title cut in the middle", () => {
  it("keeps a short title whole and a long one's last characters", () => {
    expect(titleParts("Base")).toEqual({ head: "Base", tail: "" });
    expect(titleParts("M3x8 socket head screw")).toEqual({
      head: "M3x8 socket head s",
      tail: "crew",
    });
  });

  it("cuts a mid-length title in the middle too, so a narrow tab still tells parts apart", () => {
    expect(titleParts("LED module")).toEqual({ head: "LED mod", tail: "ule" });
    expect(titleParts("Weight")).toEqual({ head: "Weight", tail: "" });
  });
});
