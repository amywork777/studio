import { describe, expect, it } from "vite-plus/test";

import {
  backupFolder,
  backupPlaceLabel,
  githubChoice,
  githubDescription,
  githubRepository,
} from "./useBackup";

const ready = {
  signedIn: true,
  account: "amywork777",
  folders: 1,
  folder: { isRepo: true, hasRemote: false },
  backedUpTo: null,
};

describe("backup", () => {
  it("backs a project up into a folder named for it, inside the one chosen", () => {
    expect(backupFolder("/Users/amy/Library/CloudStorage/GoogleDrive-a/My Drive/", "Roomba")).toBe(
      "/Users/amy/Library/CloudStorage/GoogleDrive-a/My Drive/Roomba",
    );
    expect(backupFolder("/Volumes/Backup", "Clip: v2/final")).toBe(
      "/Volumes/Backup/Clip- v2-final",
    );
    expect(backupFolder("/Volumes/Backup", "  ")).toBe("/Volumes/Backup/Project");
  });

  it("says where a backup went the way a person knows it", () => {
    expect(
      backupPlaceLabel({
        kind: "folder",
        folder: "/Users/amy/Library/CloudStorage/GoogleDrive-a/My Drive/Roomba",
      }),
    ).toBe("My Drive/Roomba");
    expect(backupPlaceLabel({ kind: "github", repository: "amywork777/roomba" })).toBe(
      "GitHub, amywork777/roomba",
    );
  });

  it("names a project's repository after the project, under the person's account", () => {
    expect(githubRepository("amywork777", "Roomba with arms")).toBe("amywork777/roomba-with-arms");
    expect(githubRepository("amywork777", "  ")).toBe("amywork777/project");
  });

  it("says Synced or Not synced only once it knows", () => {
    const backedUp = { repository: "amywork777/roomba", account: "amywork777" };
    expect(githubDescription({ ...backedUp, synced: true })).toContain("private. Synced.");
    expect(githubDescription({ ...backedUp, synced: false })).toContain("private. Not synced.");
    // Still being read says neither, and a project never sent has nothing to compare.
    expect(githubDescription({ ...backedUp, synced: null })).not.toMatch(/synced/i);
    expect(
      githubDescription({ repository: null, account: "amywork777", synced: false }),
    ).not.toMatch(/synced/i);
  });

  it("backs up to GitHub only into a repository of Studio's own", () => {
    expect(githubChoice(ready)).toEqual({ available: true, note: null, signIn: false });
    expect(
      githubChoice({
        ...ready,
        backedUpTo: "amywork777/roomba",
        folder: { isRepo: true, hasRemote: true },
      }),
    ).toEqual({ available: true, note: null, signIn: false });
    expect(githubChoice({ ...ready, folder: { isRepo: true, hasRemote: true } })).toEqual({
      available: false,
      note: "This folder already has a repository of its own, so Studio leaves it alone.",
      signIn: false,
    });
    // Not signed in says so in plain words, and offers Set up GitHub.
    expect(githubChoice({ ...ready, signedIn: false, account: null })).toEqual({
      available: false,
      note: "Not signed in to GitHub on this Mac yet.",
      signIn: true,
    });
    expect(githubChoice({ ...ready, folders: 2 }).available).toBe(false);
    expect(githubChoice({ ...ready, folder: { isRepo: false, hasRemote: false } }).available).toBe(
      false,
    );
  });
});
