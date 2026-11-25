import { describe, expect, it } from "vite-plus/test";

import { missingFolderNotice, unsentChat } from "./useOpenProject";

describe("opening a project with no thread yet", () => {
  it("opens its chat not sent yet, and none once that chat was sent", () => {
    const session = { draftId: "d1", threadId: "t1", promotedTo: null };
    expect(unsentChat(session)).toBe(session);
    expect(unsentChat({ ...session, promotedTo: undefined })).not.toBeNull();
    expect(
      unsentChat({ ...session, promotedTo: { environmentId: "e", threadId: "t1" } }),
    ).toBeNull();
    expect(unsentChat(null)).toBeNull();
  });
});

describe("opening a project whose folder is gone", () => {
  it("names the project and where its folder should be, instead of doing nothing", () => {
    expect(
      missingFolderNotice({ name: "Untitled part", folders: ["~/Documents/Studio/untitled-part"] }),
    ).toEqual({
      title: "Studio can't find Untitled part's folder",
      description:
        "It should be at ~/Documents/Studio/untitled-part. Move the folder back there, then open the project again.",
    });
    expect(missingFolderNotice(null).title).toBe("Studio can't find this project's folder");
  });
});
