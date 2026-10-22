// @effect-diagnostics nodeBuiltinImport:off
// Tests the pre-runtime bundle step on real folders, as it runs.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { applyStudioAppBundle, writeFilledCopy } from "./studioAppBundle.ts";

const made: string[] = [];
const tempDir = (prefix = "studio-app-bundle-") => {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), prefix));
  made.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of made.splice(0)) NodeFS.rmSync(dir, { recursive: true, force: true });
});

const write = (file: string, content: string) => {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, content);
};

/** A Resources folder with the bundle `scripts/build-studio-app.sh` stages. */
function resources(prefix?: string): string {
  const dir = tempDir(prefix);
  const bundle = NodePath.join(dir, "studio");
  write(
    NodePath.join(bundle, "studio.json"),
    JSON.stringify({
      name: "Studio",
      home: ".studio-test",
      profile: "studio",
      plugins: ["text-to-cad"],
    }),
  );
  write(
    NodePath.join(bundle, "marketplace", ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "studio-app", plugins: [] }),
  );
  write(
    NodePath.join(bundle, "marketplace", "plugins", "text-to-cad", "codex.mcp.json"),
    JSON.stringify({
      mcpServers: {
        cad: { command: "@@STUDIO_PYTHON@@", env: { CADGEN_MCP_APP_DIR: "@@STUDIO_PAGE@@" } },
      },
    }),
  );
  write(
    NodePath.join(bundle, "marketplace", "plugins", "text-to-cad", "skills", "cad", "SKILL.md"),
    "Run `@@STUDIO_PYTHON@@ -m cadgen.cli step snapshot part.step`.\n",
  );
  return dir;
}

describe("applyStudioAppBundle", () => {
  it("points the app at its own home, name, profile and CAD plugin", () => {
    const res = resources();
    const home = tempDir();
    const env: Record<string, string | undefined> = {};
    applyStudioAppBundle({ resourcesPath: res, homeDirectory: home, env });
    const studioHome = NodePath.join(home, ".studio-test");
    const marketplace = NodePath.join(studioHome, "studio-app-plugins");
    const python = NodePath.join(res, "studio", "python", "bin", "python3");
    expect(env).toMatchObject({
      T3CODE_HOME: studioHome,
      VITE_APP_BASE_NAME: "Studio",
      T3CODE_DESKTOP_PROFILE: "studio",
      T3CODE_DEFAULT_PLUGINS: "text-to-cad",
      T3CODE_PLUGIN_MARKETPLACE: marketplace,
    });
    // cadgen finds its builders' Node itself: Playwright's, in the bundled Python.
    expect(env).not.toHaveProperty("CADGEN_NODE");
    const skill = NodeFS.readFileSync(
      NodePath.join(marketplace, "plugins", "text-to-cad", "skills", "cad", "SKILL.md"),
      "utf8",
    );
    expect(skill).toBe(`Run \`${python} -m cadgen.cli step snapshot part.step\`.\n`);
    const config = JSON.parse(
      NodeFS.readFileSync(
        NodePath.join(marketplace, "plugins", "text-to-cad", "codex.mcp.json"),
        "utf8",
      ),
    );
    expect(config.mcpServers.cad.command).toBe(python);
    expect(config.mcpServers.cad.env.CADGEN_MCP_APP_DIR).toBe(NodePath.join(res, "studio", "page"));
  });

  it("runs Windows's Python, quoted in the skills where its folder has a space", () => {
    // As under a Windows user folder like C:\Users\Amy Zhou.
    const res = resources("Studio Test ");
    const home = tempDir();
    applyStudioAppBundle({ resourcesPath: res, homeDirectory: home, env: {}, platform: "win32" });
    const plugin = NodePath.join(
      home,
      ".studio-test",
      "studio-app-plugins",
      "plugins",
      "text-to-cad",
    );
    const python = NodePath.join(res, "studio", "python", "python.exe");
    expect(NodeFS.readFileSync(NodePath.join(plugin, "skills", "cad", "SKILL.md"), "utf8")).toBe(
      `Run \`"${python}" -m cadgen.cli step snapshot part.step\`.\n`,
    );
    const config = JSON.parse(NodeFS.readFileSync(NodePath.join(plugin, "codex.mcp.json"), "utf8"));
    expect(config.mcpServers.cad.command).toBe(python);
  });

  it("leaves what the environment already says", () => {
    const home = tempDir();
    const env: Record<string, string | undefined> = {
      T3CODE_HOME: NodePath.join(home, "elsewhere"),
    };
    applyStudioAppBundle({ resourcesPath: resources(), homeDirectory: home, env });
    expect(env.T3CODE_HOME).toBe(NodePath.join(home, "elsewhere"));
    expect(env.T3CODE_PLUGIN_MARKETPLACE).toBe(
      NodePath.join(home, "elsewhere", "studio-app-plugins"),
    );
  });

  it("does nothing without a bundle, as in T3 Code or Studio from a checkout", () => {
    const env: Record<string, string | undefined> = {};
    applyStudioAppBundle({ resourcesPath: tempDir(), homeDirectory: tempDir(), env });
    applyStudioAppBundle({ resourcesPath: undefined, homeDirectory: tempDir(), env });
    expect(env).toEqual({});
  });
});

describe("writeFilledCopy", () => {
  it("rewrites only what changed and drops what the bundle no longer has", () => {
    const source = tempDir();
    const target = tempDir();
    write(NodePath.join(source, "a.md"), "@@STUDIO_PYTHON@@\n");
    write(NodePath.join(target, "old.md"), "left from an earlier version\n");
    writeFilledCopy(source, target, { "@@STUDIO_PYTHON@@": "/Apps/Studio/python3" });
    const first = NodeFS.statSync(NodePath.join(target, "a.md")).mtimeMs;
    expect(NodeFS.readFileSync(NodePath.join(target, "a.md"), "utf8")).toBe(
      "/Apps/Studio/python3\n",
    );
    expect(NodeFS.existsSync(NodePath.join(target, "old.md"))).toBe(false);
    writeFilledCopy(source, target, { "@@STUDIO_PYTHON@@": "/Apps/Studio/python3" });
    expect(NodeFS.statSync(NodePath.join(target, "a.md")).mtimeMs).toBe(first);
  });
});
