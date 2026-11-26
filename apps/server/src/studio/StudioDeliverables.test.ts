// @effect-diagnostics nodeBuiltinImport:off -- a real folder on disk, as the packer writes one.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, it } from "@effect/vitest";
import { PluginOperationError, type PluginExportInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import yauzl from "yauzl";

import { pack, safeName } from "./StudioDeliverables.ts";

/** Every entry of a zip with its contents, read back by a zip reader that checks each checksum. */
const unzip = (file: string) =>
  new Promise<Map<string, string>>((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error !== null) return reject(error);
      const entries = new Map<string, string>();
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError !== null) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("error", reject);
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks).toString("utf8"));
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
      zip.readEntry();
    });
  });

it.effect("packs exports, copies and the receipt, and zips them", () =>
  Effect.gen(function* () {
    const cwd = yield* Effect.promise(() =>
      NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "studio-deliverables-")),
    );
    yield* Effect.promise(async () => {
      await NodeFSP.mkdir(NodePath.join(cwd, ".git", "info"), { recursive: true });
      await NodeFSP.writeFile(NodePath.join(cwd, ".git", "info", "exclude"), "/.studio/");
      await NodeFSP.mkdir(NodePath.join(cwd, "drawings"));
      await NodeFSP.writeFile(NodePath.join(cwd, "drawings", "bracket_drawing.pdf"), "%PDF sheet");
    });
    const asked: PluginExportInput[] = [];
    // The CAD tools write STEP and refuse STL, as a failed export does.
    const exportModel = (input: PluginExportInput) => {
      asked.push(input);
      const file = input.destinations[0]!;
      return file.endsWith(".stl")
        ? Effect.fail(new PluginOperationError({ reason: "request_failed", message: "no mesh" }))
        : Effect.promise(() => NodeFSP.writeFile(NodePath.join(cwd, file), "ISO-10303-21;"));
    };
    const input = {
      cwd,
      name: "Bracket: deliverables 2026-11-25",
      exports: [{ source: "parts/bracket.py", stem: "bracket", formats: ["step", "stl"] as const }],
      copies: [
        { root: cwd, path: "drawings/bracket_drawing.pdf", to: "drawings/bracket_drawing.pdf" },
        { root: cwd, path: "../elsewhere.txt", to: "bom/elsewhere.txt" },
      ],
      receipt: "# Verification receipt\n\n- Strength: passed",
      missing: ["Build guide: none made yet"],
    };
    const result = yield* pack(input, exportModel);

    assert.strictEqual(NodePath.basename(result.folder), "Bracket- deliverables 2026-11-25");
    assert.deepStrictEqual(result.files, [
      "RECEIPT.md",
      "drawings/bracket_drawing.pdf",
      "models/bracket.step",
    ]);
    assert.deepStrictEqual(
      result.failed.map((entry) => entry.file),
      ["models/bracket.stl", "bom/elsewhere.txt"],
    );
    assert.deepStrictEqual(asked[0]?.destinations, [
      "deliverables/Bracket- deliverables 2026-11-25/models/bracket.step",
    ]);

    const entries = yield* Effect.promise(() => unzip(result.zip));
    const root = NodePath.basename(result.folder);
    assert.deepStrictEqual(
      [...entries.keys()].toSorted(),
      result.files.map((f) => `${root}/${f}`),
    );
    assert.strictEqual(entries.get(`${root}/models/bracket.step`), "ISO-10303-21;");
    const receipt = entries.get(`${root}/RECEIPT.md`) ?? "";
    assert.include(receipt, "- Strength: passed");
    assert.include(receipt, "- models/bracket.step (exported by the CAD tools");
    assert.include(receipt, "- models/bracket.stl: the CAD tools could not export it (no mesh)");
    assert.include(receipt, "- bom/elsewhere.txt: it is outside the project");
    assert.include(receipt, "- Build guide: none made yet");

    const exclude = yield* Effect.promise(() =>
      NodeFSP.readFile(NodePath.join(cwd, ".git", "info", "exclude"), "utf8"),
    );
    assert.strictEqual(exclude, "/.studio/\n/deliverables/\n");

    // A second package the same day goes beside the first, never over it.
    const again = yield* pack({ ...input, exports: [], copies: [] }, exportModel);
    assert.strictEqual(NodePath.basename(again.folder), `${root} 2`);
    yield* Effect.promise(() => NodeFSP.rm(cwd, { recursive: true, force: true }));
  }),
);

it("makes a package name safe on a Mac and on Windows", () => {
  assert.strictEqual(safeName('Arm / base: "v2"?'), "Arm - base- -v2-");
  assert.strictEqual(safeName(" ..."), "Deliverables");
});
