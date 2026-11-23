import { describe, expect, it } from "vite-plus/test";

import { unsentChat } from "./useOpenProject";

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
