import { describe, expect, it } from "vite-plus/test";

import { folderLabel } from "./folderLabel";

describe("folderLabel", () => {
  it("names the file manager of the computer the project is on", () => {
    expect(folderLabel("darwin")).toBe("Show in Finder");
    expect(folderLabel("windows")).toBe("Show in File Explorer");
    expect(folderLabel("linux")).toBe("Show in Files");
    expect(folderLabel("unknown")).toBe("Show in Files");
    expect(folderLabel(undefined)).toBe("Show in Files");
  });
});
