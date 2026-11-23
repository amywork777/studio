import { describe, expect, it } from "vite-plus/test";

import { allChats, findChats, keptChats, waitingChatsFirst } from "./allChats";

const chat = (id: string, updatedAt: string, archivedAt: string | null = null) => ({
  id,
  updatedAt,
  archivedAt,
});

/** A chat as `historyOutcome` reads it, waiting on an approval or not. */
const shell = (id: string, waiting: boolean) => ({
  id,
  runtime: null,
  latestRun: null,
  hasPendingApprovals: waiting,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
});

describe("allChats", () => {
  it("lists every project's chats newest first, each with its project's name", () => {
    const { chats, projectOf } = allChats([
      {
        name: "L bracket",
        threads: [chat("a", "2026-10-20T10:00:00Z"), chat("b", "2026-10-22T09:00:00Z")],
      },
      { name: "Drone frame", threads: [chat("c", "2026-10-21T12:00:00Z")] },
    ]);
    expect(chats.map((each) => each.id)).toEqual(["b", "c", "a"]);
    expect(projectOf.get("b")).toBe("L bracket");
    expect(projectOf.get("c")).toBe("Drone frame");
  });

  it("leaves archived chats out", () => {
    const { chats } = allChats([
      {
        name: "L bracket",
        threads: [
          chat("a", "2026-10-20T10:00:00Z"),
          chat("b", "2026-10-22T09:00:00Z", "2026-10-22"),
        ],
      },
    ]);
    expect(chats.map((each) => each.id)).toEqual(["a"]);
  });

  it("finds chats by their name or their project's, every word typed", () => {
    const chats = [
      { id: "a", title: "Fillet the top edges" },
      { id: "b", title: "Motor mount" },
    ];
    const projectOf = new Map([
      ["a", "L bracket"],
      ["b", "Drone frame"],
    ]);
    expect(findChats(chats, projectOf, "").map((chat) => chat.id)).toEqual(["a", "b"]);
    expect(findChats(chats, projectOf, "drone").map((chat) => chat.id)).toEqual(["b"]);
    expect(findChats(chats, projectOf, "bracket FILLET").map((chat) => chat.id)).toEqual(["a"]);
    expect(findChats(chats, projectOf, "bracket motor")).toEqual([]);
  });

  it("puts the chats waiting on the person first, each group keeping its order", () => {
    const chats = [
      shell("newest", false),
      shell("asking", true),
      shell("older", false),
      shell("older asking", true),
    ];
    expect(waitingChatsFirst(chats).map((each) => each.id)).toEqual([
      "asking",
      "older asking",
      "newest",
      "older",
    ]);
  });

  it("keeps the chats waiting on the person in a short list, the newest after them, newest first", () => {
    const chats = [
      shell("newest", false),
      shell("newer", false),
      shell("older", false),
      shell("older asking", true),
    ];
    expect(keptChats(chats, 2, false).map((each) => each.id)).toEqual(["newest", "newer"]);
    expect(keptChats(chats, 2, true).map((each) => each.id)).toEqual(["newest", "older asking"]);
    expect(keptChats(chats, undefined, true)).toHaveLength(4);
  });

  it("lists a chat two projects share once, under the first", () => {
    const shared = chat("a", "2026-10-20T10:00:00Z");
    const { chats, projectOf } = allChats([
      { name: "L bracket", threads: [shared] },
      { name: "Drone frame", threads: [shared] },
    ]);
    expect(chats).toHaveLength(1);
    expect(projectOf.get("a")).toBe("L bracket");
  });
});
