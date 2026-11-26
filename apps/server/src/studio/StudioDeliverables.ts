// @effect-diagnostics nodeBuiltinImport:off -- copies and zips files inside the project's own folders.
/**
 * A project's deliverables package: parts exported by the CAD tools, files copied from its folders
 * and RECEIPT.md, in `deliverables/<name>/` with a zip beside it. No agent runs. Git leaves
 * `deliverables/` out, as it does `.studio/`, so a Version never carries a package.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeZlib from "node:zlib";

import {
  type PluginExportInput,
  type PluginOperationError,
  StudioDeliverablesError,
  type StudioDeliverablesInput,
  type StudioDeliverablesResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

const FOLDER = "deliverables";

/** A name safe as one folder on a Mac and on Windows. */
export function safeName(name: string): string {
  const safe = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.]+$/g, "")
    .slice(0, 80);
  return safe === "" ? "Deliverables" : safe;
}

/** `path` under `root`, or null when it leaves it. */
function inside(root: string, path: string): string | null {
  const base = NodePath.resolve(root);
  const absolute = NodePath.resolve(base, path);
  return absolute.startsWith(`${base}${NodePath.sep}`) ? absolute : null;
}

/** The receipt's list of what is in the package and what is not, after the checks. */
function receiptFiles(input: {
  readonly files: ReadonlyArray<string>;
  readonly exported: ReadonlyArray<string>;
  readonly failed: ReadonlyArray<{ readonly file: string; readonly reason: string }>;
  readonly missing: ReadonlyArray<string>;
}): string {
  const exported = new Set(input.exported);
  const lines = ["## In this package", ""];
  for (const file of input.files) {
    lines.push(
      exported.has(file)
        ? `- ${file} (exported by the CAD tools from the model as it is now)`
        : `- ${file}`,
    );
  }
  if (input.failed.length > 0 || input.missing.length > 0) {
    lines.push("", "## Not in this package", "");
    for (const { file, reason } of input.failed) lines.push(`- ${file}: ${reason}`);
    for (const line of input.missing) lines.push(`- ${line}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * A zip of `files` (path in the zip, contents), deflated: Node has the deflate and the checksum, so
 * no library is needed, and Finder, Explorer and `unzip` all open it.
 */
function zipFiles(files: ReadonlyArray<{ readonly name: string; readonly data: Buffer }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name.replaceAll("\\", "/"), "utf8");
    const packed = NodeZlib.deflateRawSync(file.data);
    const stored = packed.length >= file.data.length;
    const body = stored ? file.data : packed;
    const crc = NodeZlib.crc32(file.data) >>> 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // names in UTF-8
    head.writeUInt16LE(stored ? 0 : 8, 8);
    head.writeUInt32LE(0, 10); // no time: the receipt says when
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(file.data.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(head, name, body);
    centrals.push(central, name);
    offset += head.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** Every file under `folder`, relative to it with forward slashes, in a steady order. */
async function listFiles(folder: string, prefix = ""): Promise<string[]> {
  const entries = await NodeFSP.readdir(NodePath.join(folder, prefix), { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await listFiles(folder, relative)));
    else if (entry.isFile()) found.push(relative);
  }
  return found;
}

/** Tells git to leave the packages out, where the folder keeps a history of its own. */
async function excludeFromVersions(cwd: string) {
  const exclude = NodePath.join(cwd, ".git", "info", "exclude");
  const held = await NodeFSP.readFile(exclude, "utf8").catch(() => null);
  if (held === null) {
    const git = await NodeFSP.stat(NodePath.join(cwd, ".git")).catch(() => null);
    if (git?.isDirectory() !== true) return;
    await NodeFSP.mkdir(NodePath.dirname(exclude), { recursive: true });
  }
  if (held !== null && held.split(/\r?\n/).includes(`/${FOLDER}/`)) return;
  const before = held === null || held === "" || held.endsWith("\n") ? (held ?? "") : `${held}\n`;
  await NodeFSP.writeFile(exclude, `${before}/${FOLDER}/\n`);
}

/** Where a package of this name goes: a new folder each time, never over an earlier one. */
async function freeFolder(cwd: string, name: string) {
  const base = NodePath.join(cwd, FOLDER, safeName(name));
  for (let attempt = 1; ; attempt += 1) {
    const folder = attempt === 1 ? base : `${base} ${attempt}`;
    const taken = await NodeFSP.stat(folder).then(
      () => true,
      () => false,
    );
    if (!taken) return folder;
  }
}

const failure = (message: string) => new StudioDeliverablesError({ message });

/** Writes the package; `exportModel` is the plugins' own export, as a tab's Export runs it. */
export const pack = Effect.fn("StudioDeliverables.pack")(function* (
  input: StudioDeliverablesInput,
  exportModel: (input: PluginExportInput) => Effect.Effect<unknown, PluginOperationError>,
) {
  const folder = yield* Effect.tryPromise({
    try: async () => {
      const folder = await freeFolder(input.cwd, input.name);
      // The exports' folder first: the CAD tools write a file, not the folders above it.
      await NodeFSP.mkdir(NodePath.join(folder, "models"), { recursive: true });
      await excludeFromVersions(input.cwd);
      return folder;
    },
    catch: () => failure("Studio could not make the package's folder in the project."),
  });
  const inProject = NodePath.relative(input.cwd, folder).split(NodePath.sep).join("/");
  const failed: Array<{ file: string; reason: string }> = [];
  const exported: string[] = [];
  // One export at a time: each runs the CAD tools.
  for (const part of input.exports) {
    for (const format of part.formats) {
      const file = `models/${part.stem}.${format}`;
      const result = yield* exportModel({
        cwd: input.cwd,
        source: part.source,
        destinations: [`${inProject}/${file}`],
      }).pipe(Effect.result);
      if (result._tag === "Success") exported.push(file);
      else
        failed.push({
          file,
          reason: `the CAD tools could not export it (${result.failure.message})`,
        });
    }
  }
  return yield* Effect.tryPromise({
    try: async (): Promise<StudioDeliverablesResult> => {
      for (const copy of input.copies) {
        const from = inside(copy.root, copy.path);
        const to = inside(folder, copy.to);
        if (from === null || to === null) {
          failed.push({ file: copy.to, reason: "it is outside the project" });
          continue;
        }
        await NodeFSP.mkdir(NodePath.dirname(to), { recursive: true });
        await NodeFSP.copyFile(from, to).catch(() =>
          failed.push({ file: copy.to, reason: "it could not be read" }),
        );
      }
      const files = [...(await listFiles(folder)), "RECEIPT.md"].toSorted();
      const receipt = `${input.receipt.trimEnd()}\n\n${receiptFiles({ files, exported, failed, missing: input.missing })}`;
      await NodeFSP.writeFile(NodePath.join(folder, "RECEIPT.md"), receipt);
      const name = NodePath.basename(folder);
      const zip = `${folder}.zip`;
      const contents = await Promise.all(
        files.map(async (file) => ({
          name: `${name}/${file}`,
          data: await NodeFSP.readFile(NodePath.join(folder, ...file.split("/"))),
        })),
      );
      await NodeFSP.writeFile(zip, zipFiles(contents));
      return { folder, zip, files, failed };
    },
    catch: () =>
      failure("Studio could not write the package. The project's files are as they were."),
  });
});
