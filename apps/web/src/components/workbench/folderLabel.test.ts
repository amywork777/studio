import { describe, expect, it } from "vite-plus/test";

import { folderLabel, folderPlace } from "./folderLabel";

describe("folderLabel", () => {
  it("names the file manager of the computer the project is on", () => {
    expect(folderLabel("darwin")).toBe("Show in Finder");
    expect(folderLabel("windows")).toBe("Show in File Explorer");
    expect(folderLabel("linux")).toBe("Show in Files");
    expect(folderLabel("unknown")).toBe("Show in Files");
    expect(folderLabel(undefined)).toBe("Show in Files");
  });

  it("says where a project's folder is, its home folder written ~", () => {
    expect(folderPlace("/Users/amy/Studio/bracket")).toBe("~/Studio/bracket");
    expect(folderPlace("C:\\Users\\amy\\Studio\\bracket")).toBe("~\\Studio\\bracket");
    expect(folderPlace("/home/amy/parts")).toBe("~/parts");
    expect(folderPlace("/Volumes/Work/bracket")).toBe("/Volumes/Work/bracket");
    expect(folderPlace("/Users/amyx")).toBe("~");
  });
});
