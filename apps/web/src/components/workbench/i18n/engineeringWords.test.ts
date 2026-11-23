import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../studioInterface", () => ({ isEngineeringInterface: () => true }));

const { engineeringWords } = await import("./engineeringWords");

describe("T3's words in the engineering interface", () => {
  it("names a project's chats Chats, as the Overview does", () => {
    expect(engineeringWords("Threads")).toBe("Chats");
    expect(engineeringWords("Settings")).toBe("Settings");
  });
});
