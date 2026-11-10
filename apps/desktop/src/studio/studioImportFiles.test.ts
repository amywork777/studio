// @effect-diagnostics nodeBuiltinImport:off - the test builds folders with Node's own APIs.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { backUp, copyInto, defaultRoots, isOpenable, scanFolder } from "./studioImportFiles.ts";

let home: string;

beforeEach(async () => {
  home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "studio-import-"));
});

afterEach(async () => {
  await NodeFSP.rm(home, { recursive: true, force: true });
});

async function write(relative: string, text = "x") {
  const path = NodePath.join(home, relative);
  await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true });
  await NodeFSP.writeFile(path, text);
  return path;
}

describe("scanFolder", () => {
  it("finds engineering files and their kinds, and leaves out the rest", async () => {
    await write("Kawarobo/Mini/gear.step");
    await write("Kawarobo/Mini/robot BOM.xlsx");
    await write("Kawarobo/photo.jpg");
    await write("Kawarobo/song.mp3");
    const scan = await scanFolder(home);
    const found = scan.files
      .map((file) => [NodePath.relative(home, file.path), file.kind])
      .toSorted();
    expect(found).toEqual([
      ["Kawarobo/Mini/gear.step", "model"],
      ["Kawarobo/Mini/robot BOM.xlsx", "partsList"],
      ["Kawarobo/photo.jpg", "photo"],
    ]);
    expect(scan.truncated).toBe(false);
  });

  it("skips hidden folders, caches and app bundles", async () => {
    await write(".git/objects/part.step");
    await write("node_modules/pkg/part.step");
    await write("Tool.app/Contents/part.step");
    await write("real/part.step");
    const scan = await scanFolder(home);
    expect(scan.files.map((file) => NodePath.relative(home, file.path))).toEqual([
      "real/part.step",
    ]);
  });

  it("stops at its limits and says so", async () => {
    await write("a.step");
    await write("b.step");
    await write("deep/1/2/c.step");
    const scan = await scanFolder(home, { files: 1, depth: 1 });
    expect(scan.files).toHaveLength(1);
    expect(scan.truncated).toBe(true);
    const shallow = await scanFolder(home, { files: 100, depth: 1 });
    expect(shallow.files.map((file) => NodePath.basename(file.path)).toSorted()).toEqual([
      "a.step",
      "b.step",
    ]);
  });

  it("treats a file on its own as its own scan", async () => {
    const part = await write("loose/arm v2.step");
    const scan = await scanFolder(part);
    expect(scan.files.map((file) => [file.path, file.kind])).toEqual([[part, "model"]]);
    expect((await scanFolder(await write("loose/song.mp3"))).files).toEqual([]);
  });
});

describe("defaultRoots", () => {
  const LABELS = { documents: "Documents", desktop: "Desktop", downloads: "Downloads" };

  it("offers Documents, Desktop and Downloads where they exist", async () => {
    await NodeFSP.mkdir(NodePath.join(home, "Documents"));
    await NodeFSP.mkdir(NodePath.join(home, "Downloads"));
    expect(
      (await defaultRoots((name) => NodePath.join(home, LABELS[name]))).map((root) => root.label),
    ).toEqual(["Documents", "Downloads"]);
  });

  it("looks where the system says each folder is, not in the home folder", async () => {
    // As OneDrive's folder backup leaves a Windows PC: Documents and Desktop moved under OneDrive.
    const moved = NodePath.join(home, "OneDrive");
    await NodeFSP.mkdir(NodePath.join(moved, "Documents"), { recursive: true });
    await NodeFSP.mkdir(NodePath.join(moved, "Desktop"));
    await NodeFSP.mkdir(NodePath.join(home, "Downloads"));
    const pathOf = (name: keyof typeof LABELS) =>
      NodePath.join(name === "downloads" ? home : moved, LABELS[name]);
    expect(await defaultRoots(pathOf)).toEqual([
      { label: "Documents", path: NodePath.join(moved, "Documents") },
      { label: "Desktop", path: NodePath.join(moved, "Desktop") },
      { label: "Downloads", path: NodePath.join(home, "Downloads") },
    ]);
  });

  it("leaves out a folder the system cannot place", async () => {
    await NodeFSP.mkdir(NodePath.join(home, "Documents"));
    const pathOf = (name: keyof typeof LABELS) => {
      if (name !== "documents") throw new Error(`Failed to get '${name}' path`);
      return NodePath.join(home, LABELS[name]);
    };
    expect((await defaultRoots(pathOf)).map((root) => root.label)).toEqual(["Documents"]);
  });
});

describe("copyInto", () => {
  it("copies files and folders without writing over what is there", async () => {
    const part = await write("in/part.step", "new");
    await write("in/sub/drawing.dxf");
    await write("project/part.step", "old");
    const copied = await copyInto(
      [part, NodePath.join(home, "in/sub")],
      NodePath.join(home, "project"),
    );
    expect(copied.map((path) => NodePath.relative(home, path))).toEqual([
      "project/part (2).step",
      "project/sub",
    ]);
    expect(await NodeFSP.readFile(NodePath.join(home, "project/part.step"), "utf8")).toBe("old");
    expect(await NodeFSP.readFile(NodePath.join(home, "project/part (2).step"), "utf8")).toBe(
      "new",
    );
    await expect(
      NodeFSP.access(NodePath.join(home, "project/sub/drawing.dxf")),
    ).resolves.toBeUndefined();
  });
});

describe("backUp", () => {
  it("copies a project with its history, then only what changed, and leaves out caches", async () => {
    await write("roomba/parts/bumper.step", "solid v1");
    await write("roomba/.git/objects/ab/cdef", "object");
    await write("roomba/.git/index.lock", "busy");
    await write("roomba/node_modules/x/index.js");
    await write("roomba/.studio/compare/key/older.step");
    const project = NodePath.join(home, "roomba");
    const drive = NodePath.join(home, "Google Drive", "Roomba");

    const first = await backUp([project], drive);
    expect(first.folder).toBe(drive);
    expect(first.copied).toBe(2);
    const backed = (relative: string) => NodeFSP.readFile(NodePath.join(drive, relative), "utf8");
    expect(await backed("roomba/parts/bumper.step")).toBe("solid v1");
    expect(await backed("roomba/.git/objects/ab/cdef")).toBe("object");
    await expect(NodeFSP.access(NodePath.join(drive, "roomba/node_modules"))).rejects.toThrow();
    await expect(NodeFSP.access(NodePath.join(drive, "roomba/.studio"))).rejects.toThrow();
    await expect(NodeFSP.access(NodePath.join(drive, "roomba/.git/index.lock"))).rejects.toThrow();

    expect((await backUp([project], drive)).copied).toBe(0);

    await write("roomba/parts/bumper.step", "solid v2, a little longer");
    await write("roomba/docs/PRD.md", "# PRD");
    expect((await backUp([project], drive)).copied).toBe(2);
    expect(await backed("roomba/parts/bumper.step")).toBe("solid v2, a little longer");
  });

  it("refuses to back a project up into itself", async () => {
    await write("roomba/parts/bumper.step");
    const project = NodePath.join(home, "roomba");
    await expect(backUp([project], NodePath.join(project, "backups"))).rejects.toThrow(
      "Choose a folder outside the project",
    );
  });
});

describe("isOpenable", () => {
  it("opens documents, sheets, drawings and models in their own app, never anything that runs", () => {
    for (const path of ["/p/BOM.xlsx", "/p/xRD.docx", "/p/fab/board.zip", "/p/main.kicad_sch"]) {
      expect(isOpenable(path)).toBe(true);
    }
    for (const path of ["/p/run.command", "/p/setup.sh", "/p/Tool.app", "/p/part.py", "/p/a.js"]) {
      expect(isOpenable(path)).toBe(false);
    }
  });
});
