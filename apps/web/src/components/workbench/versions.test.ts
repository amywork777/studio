import { describe, expect, it } from "vite-plus/test";

import type { CheckResult } from "./checkResults";
import {
  checkChanges,
  checkpointBefore,
  checkpointScopeOf,
  extentLine,
  isPartPath,
  keepsNoVersions,
  plainRestoreError,
  plainVersionsError,
  readCheckpointRef,
  restoreNote,
  scriptRows,
  sizeChanges,
  sizeLine,
  sizeName,
  versionChoices,
  versionedPath,
  volumeLine,
  type PartVersion,
  type ShapeComparison,
} from "./versions";

const REF =
  "refs/t3/orchestration-v2/checkpoints/YmNiZDAxNjdlNTVmODBlZGRkNjY4YTc5NjIyNzU5YzM/ordinal/7";
const sizes = (...entries: Array<[string, number]>) =>
  entries.map(([name, value], index) => ({ name, value, line: index + 1 }));
const done = (input: Partial<Extract<ShapeComparison, { status: "done" }>>): ShapeComparison => ({
  status: "done",
  same: false,
  moved: false,
  added_mm3: 0,
  removed_mm3: 0,
  kept_mm3: 0,
  older: { bbox: { min: [0, 0, 0], max: [40, 30, 70] }, volume_mm3: 0, bodies: 1 },
  newer: { bbox: { min: [0, 0, 0], max: [48, 30, 70] }, volume_mm3: 0, bodies: 1 },
  ...input,
});
const check = (check: string, headline: string): CheckResult => ({
  path: `${check}.json`,
  model: "",
  part: "hook.step",
  check,
  status: "ready",
  headline,
  issues: [],
});

describe("versions", () => {
  it("reads a checkpoint ref's thread scope and turn, and the turn before", () => {
    expect(readCheckpointRef(REF)).toEqual({
      scope: "YmNiZDAxNjdlNTVmODBlZGRkNjY4YTc5NjIyNzU5YzM",
      turn: 7,
    });
    expect(checkpointBefore(REF)).toBe(REF.replace("/ordinal/7", "/ordinal/6"));
    expect(checkpointBefore(REF.replace("/ordinal/7", "/ordinal/0"))).toBeNull();
    expect(readCheckpointRef("refs/heads/main")).toBeNull();
  });

  it("names a thread's checkpoint scope the way Studio's server does", async () => {
    // Base64Url of the first 32 hex digits of SHA-256 of "checkpoint-scope:thread:thread%20one%2F2:name:root".
    expect(await checkpointScopeOf("thread one/2")).toBe(
      "NDNiZGQ5ZWNmNTYxMDQxNDIxNWE5YTI3MmYyZmIzZjk",
    );
  });

  it("says a script's sizes in an engineer's words", () => {
    expect(sizeName("HOOK_DEPTH")).toBe("Hook depth");
    expect(sizeName("M3_HOLE_DIA")).toBe("M3 hole dia");
    expect(sizeName("wallThickness")).toBe("Wall thickness");
  });

  it("lists the sizes that changed, were added or were removed", () => {
    const changes = sizeChanges(
      sizes(["HOOK_DEPTH", 40], ["SCREW_HOLE", 6], ["OLD_TAB", 5], ["WALL", 2]),
      sizes(["HOOK_DEPTH", 48], ["SCREW_HOLE", 6.35], ["WALL", 2.0004], ["RIB_DEPTH", 3]),
    )!;
    expect(changes.map((change) => sizeLine(change, "mm"))).toEqual([
      "Hook depth 40 to 48 mm",
      "Screw hole 6 to 6.35 mm",
      "Rib depth added: 3 mm",
      "Old tab removed",
    ]);
    expect(sizeChanges(null, sizes(["A", 1]))).toBeNull();
  });

  it("tells a size written twice apart by its order", () => {
    const changes = sizeChanges(
      sizes(["WIDTH", 10], ["WIDTH", 20]),
      sizes(["WIDTH", 10], ["WIDTH", 25]),
    )!;
    expect(changes.map((change) => sizeLine(change, ""))).toEqual(["WIDTH (2) 20 to 25"]);
  });

  it("says a one-word size in its comment's words, else as the script writes it", () => {
    const script = (value: number) =>
      `STAGE = ${value}  # the lift of the tray: about 19 at rest\nPLATE = ${value}\nGAP = ${value}  # 3\n`;
    const line = (name: string, at: number) => ({ name, value: 19, line: at });
    const lines = sizeChanges(
      [line("STAGE", 1), line("PLATE", 2), line("GAP", 3)],
      [
        { ...line("STAGE", 1), value: 20 },
        { ...line("PLATE", 2), value: 20 },
        { ...line("GAP", 3), value: 20 },
      ],
      { older: script(19), newer: script(20) },
    )!.map((change) => sizeLine(change, "mm"));
    expect(lines).toEqual(["Lift of the tray 19 to 20 mm", "PLATE 19 to 20 mm", "GAP 19 to 20 mm"]);
  });

  it("says how the volume and the size changed", () => {
    expect(volumeLine(done({ added_mm3: 6400, removed_mm3: 0, kept_mm3: 52000 }))).toBe(
      "Volume +6,400 mm³ (+12%)",
    );
    expect(volumeLine(done({ added_mm3: 0, removed_mm3: 4800, kept_mm3: 7200 }))).toBe(
      "Volume −4,800 mm³ (−40%)",
    );
    expect(volumeLine(done({ kept_mm3: 100 }))).toBe("Volume unchanged");
    expect(extentLine(done({}))).toBe("48 × 30 × 70 mm, was 40 × 30 × 70");
    expect(volumeLine({ status: "working", retryMs: 1000 })).toBeNull();
  });

  it("says how each check went then and now", () => {
    expect(
      checkChanges(
        [
          check("Strength", "1 to fix · stress at the hook"),
          check("FDM printing", "Ready to print"),
        ],
        [
          check("Strength", "Holds the load, safety factor 2.1"),
          check("FDM printing", "Ready to print"),
          check("Vibration", "No resonance below 200 Hz"),
        ],
      ),
    ).toEqual([
      {
        check: "Strength",
        line: "Holds the load, safety factor 2.1, was 1 to fix · stress at the hook",
      },
      { check: "FDM printing", line: "Ready to print, as before" },
      { check: "Vibration", line: "No resonance below 200 Hz, new" },
    ]);
    expect(checkChanges([check("Strength", "Ready")], [])).toEqual([
      { check: "Strength", line: "No longer run" },
    ]);
  });

  it("shows a script's changed lines with their context, the rest folded", () => {
    const older = ["import x", "a = 1", "b = 2", "c = 3", "d = 4", "HOOK_DEPTH = 40", "e = 5"].join(
      "\n",
    );
    const newer = ["import x", "a = 1", "b = 2", "c = 3", "d = 4", "HOOK_DEPTH = 48", "e = 5"].join(
      "\n",
    );
    const read = (rows: ReturnType<typeof scriptRows>) => rows.map(({ key: _key, ...row }) => row);
    expect(read(scriptRows(older, newer, 1))).toEqual([
      { kind: "folded", count: 4 },
      { kind: "same", text: "d = 4" },
      { kind: "removed", text: "HOOK_DEPTH = 40" },
      { kind: "added", text: "HOOK_DEPTH = 48" },
      { kind: "same", text: "e = 5" },
    ]);
    expect(read(scriptRows("a\nb", "a\nb\nc"))).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
      { kind: "added", text: "c" },
    ]);
  });
});

describe("restoring a version", () => {
  const version = (id: string, blob: string, ref: string | null = REF): PartVersion => ({
    id,
    ref,
    time: 0,
    blob,
  });

  it("lists what was kept on restoring, and what Now was restored from", () => {
    const listed = [
      version("a1", "blob-1"),
      version("b2", "blob-2"),
      version("c3", "blob-3", "refs/studio/kept/1729500000000-c3"),
      version("now", "blob-1", null),
    ];
    const choices = versionChoices(
      listed,
      (entry) => (entry.id === "b2" ? "Strength check" : null),
      () => "2 min ago",
    );
    expect(choices.map((choice) => [choice.label, choice.detail])).toEqual([
      ["Version 1", "2 min ago"],
      ["Version 2", "2 min ago, Strength check"],
      ["Version 3", "2 min ago, what you had before restoring"],
      ["Now", "restored from Version 1, 2 min ago"],
    ]);
    // A hand edit that matches no version says so.
    expect(
      versionChoices(
        [version("a1", "blob-1"), version("now", "blob-9", null)],
        () => null,
        () => "now",
      )[1],
    ).toMatchObject({ label: "Now", detail: "changed by hand now" });
  });

  it("tells the agent which part went back, to which version, and its files", () => {
    expect(
      restoreNote({
        part: "Daisy cover",
        version: "Version 3",
        when: "2 hours ago",
        files: ["parts/daisy_cover.step", "parts/daisy_cover.py"],
      }),
    ).toBe(
      "In Version history I restored the daisy cover to Version 3, from 2 hours ago (parts/daisy_cover.step, parts/daisy_cover.py).",
    );
  });

  it("says why it could not, in plain words", () => {
    expect(plainRestoreError("Not found")).toBe(
      "Studio needs a restart before it can restore a version.",
    );
    expect(plainRestoreError("There is no such version.")).toBe("There is no such version.");
    expect(plainRestoreError("fatal: unable to write new index file")).toBe(
      "Studio couldn't restore that version.",
    );
  });
});

describe("a folder that keeps no versions", () => {
  // The CAD service's reason, as `versions.py` words it.
  const noHistory =
    "/Users/sam/Documents/Client Bracket keeps no versions: it is not a git repository";

  it("is told from every other reason the versions could not be read", () => {
    expect(keepsNoVersions(noHistory)).toBe(true);
    expect(
      keepsNoVersions("C:\\Parts\\Bracket keeps no versions: it is not a git repository"),
    ).toBe(true);
    // No git on this computer, a CAD service that is not running, or nothing asked yet.
    expect(keepsNoVersions("[Errno 2] No such file or directory: 'git'")).toBe(false);
    expect(keepsNoVersions("Failed to fetch")).toBe(false);
    expect(keepsNoVersions(null)).toBe(false);
    expect(keepsNoVersions(undefined)).toBe(false);
  });

  it("says so in plain words, without the folder's path or git's words", () => {
    expect(plainVersionsError(noHistory)).toBe(
      "No versions are kept in this project's folder yet, so a change the agent makes can't be restored.",
    );
    expect(plainVersionsError("[Errno 2] No such file or directory: 'git'")).toBe(
      "Studio couldn't read the versions.",
    );
    expect(plainVersionsError(null)).toBe("Studio couldn't read the versions.");
  });
});

describe("a part's versioned file", () => {
  // A text-to-cad 0.10 model, listed by its document id, made by its script.
  const bracket = {
    path: "7dde5cd8-809d-5212-afd0-2a5e48278472",
    name: "bracket.py",
    title: "Bracket",
    folder: "parts",
    group: "CAD",
    kind: "Part",
    document: "7dde5cd8-809d-5212-afd0-2a5e48278472",
    script: "parts/bracket.py",
  } as const;

  it("reads a model's versions from its script, which every checkpoint holds, never its id", () => {
    expect(versionedPath(bracket)).toBe("parts/bracket.py");
    const { document: _document, script: _script, ...step } = bracket;
    expect(versionedPath({ ...step, path: "parts/plate.step", name: "plate.step" })).toBe(
      "parts/plate.step",
    );
  });

  it("is asked for by its script, its id, or the STEP exported beside it, never a neighbour's", () => {
    expect(
      ["parts/bracket.py", bracket.path, "parts/bracket.step", "parts/bracket_flat.step"].map(
        (path) => isPartPath(bracket, path),
      ),
    ).toEqual([true, true, true, false]);
  });
});
