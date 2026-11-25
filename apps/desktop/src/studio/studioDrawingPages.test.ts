// @effect-diagnostics nodeBuiltinImport:off - the test reads what was written with Node's own APIs.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { writeDrawingPages } from "./studioDrawingPages.ts";

describe("writeDrawingPages", () => {
  it("writes a drawing's pages into its -pages folder and nothing else anywhere", async () => {
    const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "studio-pages-"));
    try {
      const folder = NodePath.join(home, "brief", "references", "FL-100-pages");
      const png = new Uint8Array([137, 80, 78, 71]);
      await writeDrawingPages(folder, [
        { name: "page-01.png", bytes: png },
        { name: "pages.json", bytes: new TextEncoder().encode("{}") },
      ]);
      expect((await NodeFSP.readdir(folder)).toSorted()).toEqual(["page-01.png", "pages.json"]);

      await expect(
        writeDrawingPages(NodePath.join(home, "brief"), [{ name: "page-01.png", bytes: png }]),
      ).rejects.toThrow("-pages folder");
      await expect(
        writeDrawingPages(folder, [{ name: "../../evil.sh", bytes: png }]),
      ).rejects.toThrow("Only a drawing's page pictures");
      await expect(writeDrawingPages("relative-pages", [])).rejects.toThrow("-pages folder");
    } finally {
      await NodeFSP.rm(home, { recursive: true, force: true });
    }
  });
});
