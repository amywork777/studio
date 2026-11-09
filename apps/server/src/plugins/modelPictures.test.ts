// @effect-diagnostics nodeBuiltinImport:off -- a stand-in renderer writes files the way `cad <type> snapshot` does.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { documentType, renderModelPictures, snapshotLaunch } from "./modelPictures.ts";

const server = (args: string[]) => ({
  command: "uvx",
  args,
  env: { CAD_INSTALL_CHANNEL: "agent-plugins" },
  cwd: null,
  url: null,
  headers: {},
  startupTimeoutSec: null,
  toolTimeoutSec: null,
});

describe("model pictures", () => {
  it("renders with the plugin's own release: its CAD server's `cad <type> snapshot`", () => {
    const launchOf = (pin: string) =>
      snapshotLaunch(
        {
          root: "/plugin",
          servers: {
            cad: server([
              "--no-config",
              "--python",
              "3.14",
              "--from",
              `cad-mcp==${pin}`,
              "cad-mcp",
            ]),
          },
        },
        { PATH: "/usr/bin" },
      );
    const release = launchOf("0.11.3");
    expect(release?.args).toEqual([
      "--no-config",
      "--python",
      "3.14",
      "--from",
      "cad-server==0.11.3",
      "cad",
    ]);
    expect(release?.typeless).toBeUndefined();
    expect(release?.env).toMatchObject({
      PATH: "/usr/bin",
      CAD_INSTALL_CHANNEL: "agent-plugins",
    });
    // 0.10's `cad snapshot` took a document of any type.
    expect(launchOf("0.10.4")?.typeless).toBe(true);
    const checkout = snapshotLaunch(
      {
        root: "/plugin",
        servers: {
          cad: { ...server(["-m", "cad_mcp"]), command: "/w/.venv/bin/python" },
        },
      },
      {},
    );
    expect(checkout?.args).toEqual(["-m", "cad_server.cli"]);
    expect(checkout?.typeless).toBeUndefined();
    expect(
      snapshotLaunch({ root: "/p", servers: { other: server(["some-server", "mcp"]) } }, {}),
    ).toBeNull();
  });

  it("names each document's type, as `cad <type> snapshot` takes it", () => {
    expect(
      [
        "parts/bracket.STEP",
        "parts/clip.stp",
        "XBF/plate.xbf",
        "out/plate.3mf",
        "studies/tip-load/result.glb",
        "drawings/sheet.dxf",
        "robots/arm.urdf",
        "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90",
        "notes.md",
      ].map(documentType),
    ).toEqual(["step", "step", "xbf", "threemf", "glb", "dxf", "urdf", "model", null]);
  });

  it("draws one batch a document type, each with its own type's command", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pictures-"));
    for (const name of ["a.step", "b.step", "c.glb"]) {
      NodeFS.writeFileSync(NodePath.join(dir, name), "x");
    }
    const runs = NodePath.join(dir, "runs.txt");
    // Stands in for `cad <type> snapshot --job`, saying which command drew which files.
    const renderer = NodePath.join(dir, "renderer.mjs");
    NodeFS.writeFileSync(
      renderer,
      `import fs from "node:fs";
       import path from "node:path";
       const at = process.argv.indexOf("--job");
       const jobs = JSON.parse(fs.readFileSync(process.argv[at + 1], "utf8"));
       const command = process.argv.slice(2, at).join(" ");
       fs.appendFileSync(${JSON.stringify(runs)}, command + ": " + jobs.map((job) => path.basename(job.input)).join(",") + "\\n");
       for (const job of jobs) fs.writeFileSync(job.outputs[0].path, "PNG");`,
    );
    const launch = { command: process.execPath, args: [renderer, "cad"], env: {}, cwd: dir };
    const paths = ["a.step", "c.glb", "b.step"];
    await renderModelPictures({ launch, cwd: dir, paths, cacheDir: NodePath.join(dir, "cache") });
    expect(NodeFS.readFileSync(runs, "utf8").trim().split("\n")).toEqual([
      "cad step snapshot: a.step,b.step",
      "cad glb snapshot: c.glb",
    ]);
    // A release before 0.11 draws them all in one `cad snapshot`.
    NodeFS.rmSync(runs);
    await renderModelPictures({
      launch: { ...launch, typeless: true },
      cwd: dir,
      paths,
      cacheDir: NodePath.join(dir, "cache-0.10"),
    });
    expect(NodeFS.readFileSync(runs, "utf8").trim().split("\n")).toEqual([
      "cad snapshot: a.step,c.glb,b.step",
    ]);
  });

  it("renders what is missing in one batch, then answers from the cache", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pictures-"));
    const project = NodePath.join(dir, "project");
    NodeFS.mkdirSync(NodePath.join(project, "parts"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(project, "parts", "bracket.step"), "ISO-10303-21;");
    NodeFS.writeFileSync(NodePath.join(project, "parts", "broken.step"), "not a step");
    const runs = NodePath.join(dir, "runs.txt");
    // Stands in for `cad <type> snapshot --job`: writes each job's picture, refuses broken files.
    const renderer = NodePath.join(dir, "renderer.mjs");
    NodeFS.writeFileSync(
      renderer,
      `import fs from "node:fs";
       const jobs = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
       fs.appendFileSync(${JSON.stringify(runs)}, jobs.length + "\\n");
       if (jobs.some((job) => job.input.endsWith("broken.step"))) process.exit(2);
       for (const job of jobs) fs.writeFileSync(job.outputs[0].path, "PNG");`,
    );
    const input = {
      launch: { command: process.execPath, args: [renderer], env: {}, cwd: dir },
      cwd: project,
      paths: ["parts/bracket.step", "parts/broken.step", "parts/notes.md", "../outside.step"],
      cacheDir: NodePath.join(dir, "cache"),
    };
    const first = await renderModelPictures(input);
    expect(first).toEqual([
      { path: "parts/bracket.step", png: Buffer.from("PNG").toString("base64") },
      { path: "parts/broken.step", png: null },
      { path: "parts/notes.md", png: null },
      { path: "../outside.step", png: null },
    ]);
    // The batch failed on the broken file, so each was rendered alone.
    expect(NodeFS.readFileSync(runs, "utf8").trim().split("\n")).toEqual(["2", "1", "1"]);
    await renderModelPictures({ ...input, paths: ["parts/bracket.step"] });
    expect(NodeFS.readFileSync(runs, "utf8").trim().split("\n")).toHaveLength(3);
  });

  it("draws a part on nothing, for the tile's ground to show, and a drawing on its paper", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pictures-"));
    NodeFS.writeFileSync(NodePath.join(dir, "bracket.step"), "ISO-10303-21;");
    NodeFS.writeFileSync(NodePath.join(dir, "sheet.dxf"), "0\nEOF");
    const outputs = NodePath.join(dir, "outputs.txt");
    // Stands in for `cad <type> snapshot --job`, saying how each job asked to be finished.
    const renderer = NodePath.join(dir, "renderer.mjs");
    NodeFS.writeFileSync(
      renderer,
      `import fs from "node:fs";
       const jobs = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
       for (const job of jobs) {
         fs.appendFileSync(${JSON.stringify(outputs)}, JSON.stringify(job.output) + "\\n");
         fs.writeFileSync(job.outputs[0].path, "PNG");
       }`,
    );
    await renderModelPictures({
      launch: { command: process.execPath, args: [renderer], env: {}, cwd: dir },
      cwd: dir,
      paths: ["bracket.step", "sheet.dxf"],
      cacheDir: NodePath.join(dir, "cache"),
    });
    expect(
      NodeFS.readFileSync(outputs, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([{ padding: 0.08, transparent: true }, { padding: 0.08 }]);
  });

  it("pictures a model by its document id, cached by its build, and an .xbf by its path", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pictures-"));
    const project = NodePath.join(dir, "project");
    NodeFS.mkdirSync(NodePath.join(project, "XBF"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(project, "XBF", "plate.xbf"), "xbf");
    const inputs = NodePath.join(dir, "inputs.txt");
    // Stands in for `cad <type> snapshot --job`, saying what each job drew.
    const renderer = NodePath.join(dir, "renderer.mjs");
    NodeFS.writeFileSync(
      renderer,
      `import fs from "node:fs";
       const jobs = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
       for (const job of jobs) {
         fs.appendFileSync(${JSON.stringify(inputs)}, job.input + "\\n");
         fs.writeFileSync(job.outputs[0].path, "PNG");
       }`,
    );
    const id = "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90";
    const input = {
      launch: { command: process.execPath, args: [renderer], env: {}, cwd: dir },
      cwd: project,
      paths: [id, "XBF/plate.xbf"],
      versions: { [id]: "1761555600.5" },
      cacheDir: NodePath.join(dir, "cache"),
    };
    const png = Buffer.from("PNG").toString("base64");
    expect(await renderModelPictures(input)).toEqual([
      { path: id, png },
      { path: "XBF/plate.xbf", png },
    ]);
    expect(NodeFS.readFileSync(inputs, "utf8").trim().split("\n")).toEqual([
      id,
      NodePath.join(project, "XBF", "plate.xbf"),
    ]);
    // The same build answers from the cache; a new build is drawn again.
    await renderModelPictures({ ...input, paths: [id] });
    expect(NodeFS.readFileSync(inputs, "utf8").trim().split("\n")).toHaveLength(2);
    await renderModelPictures({ ...input, paths: [id], versions: { [id]: "1761555700.1" } });
    expect(NodeFS.readFileSync(inputs, "utf8").trim().split("\n")).toHaveLength(3);
    // An id with no build named has no picture to keep: nothing is drawn for it.
    expect(await renderModelPictures({ ...input, paths: [id], versions: {} })).toEqual([
      { path: id, png: null },
    ]);
  });

  it("answers a KiCad board with no picture, asking the renderer for nothing", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pictures-"));
    const project = NodePath.join(dir, "project");
    NodeFS.mkdirSync(NodePath.join(project, "boards"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(project, "boards", "driver.kicad_pcb"), "(kicad_pcb)");
    const runs = NodePath.join(dir, "runs.txt");
    // A renderer that would fail the request if it were asked: the CAD server draws no board.
    const renderer = NodePath.join(dir, "renderer.mjs");
    NodeFS.writeFileSync(
      renderer,
      `import fs from "node:fs";
       fs.appendFileSync(${JSON.stringify(runs)}, "ran\\n");
       process.exit(2);`,
    );
    const pictures = await renderModelPictures({
      launch: { command: process.execPath, args: [renderer], env: {}, cwd: dir },
      cwd: project,
      paths: ["boards/driver.kicad_pcb"],
      cacheDir: NodePath.join(dir, "cache"),
    });
    expect(pictures).toEqual([{ path: "boards/driver.kicad_pcb", png: null }]);
    expect(NodeFS.existsSync(runs)).toBe(false);
  });
});
