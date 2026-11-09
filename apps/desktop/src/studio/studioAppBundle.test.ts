// @effect-diagnostics nodeBuiltinImport:off
// Tests the pre-runtime bundle step on real folders, as it runs.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { applyStudioAppBundle, writeFilledCopy } from "./studioAppBundle.ts";
import {
  checkoutEngineEnv,
  STUDIO_DEV_ENGINE_PORT,
  STUDIO_ENGINE_PORT,
  studioEngineEnv,
} from "./studioEngine.ts";

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
function resources(prefix?: string, extra: Record<string, unknown> = {}): string {
  const dir = tempDir(prefix);
  const bundle = NodePath.join(dir, "studio");
  write(
    NodePath.join(bundle, "studio.json"),
    JSON.stringify({
      name: "Studio",
      home: ".studio-test",
      profile: "studio",
      plugins: ["text-to-cad"],
      ...extra,
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
        cad: { command: "@@STUDIO_PYTHON@@" },
      },
    }),
  );
  write(
    NodePath.join(bundle, "marketplace", "plugins", "text-to-cad", "skills", "cad", "SKILL.md"),
    "Run `@@STUDIO_PYTHON@@ -m cad_server.cli snapshot part.step part.png`.\n",
  );
  return dir;
}

describe("studioEngineEnv", () => {
  it("gives Studio's CAD server its own folders under its home, and a port of its own", () => {
    const homes = ["/Users/a/.text-to-cad-studio", "/Users/a/.text-to-cad-studio-dev"];
    const release = studioEngineEnv(homes[0]!, { dev: false });
    const dev = studioEngineEnv(homes[1]!, { dev: true });
    for (const [env, home] of [
      [release, homes[0]!],
      [dev, homes[1]!],
    ] as const) {
      const folders = [env.CAD_STATE_DIR, env.CAD_CACHE_DIR, env.CAD_ENGINE_DIR];
      expect(new Set(folders).size).toBe(3);
      for (const folder of [...folders, env.CAD_LAUNCHER_DIR]) {
        expect(folder.startsWith(`${home}/`)).toBe(true);
      }
    }
    // Never a user's CAD server's 3245, nor a port it rolls to from there (64 past it); a checkout's
    // Studio never shares the app's.
    for (const port of [Number(release.CAD_ENGINE_PORT), Number(dev.CAD_ENGINE_PORT)]) {
      expect(port < 3245 || port > 3245 + 64).toBe(true);
    }
    expect(dev.CAD_ENGINE_PORT).toBe(String(STUDIO_DEV_ENGINE_PORT));
    expect(release.CAD_ENGINE_PORT).not.toBe(dev.CAD_ENGINE_PORT);
  });
});

describe("checkoutEngineEnv", () => {
  it("runs a checkout's Studio on its own home and port, whatever its mode", () => {
    for (const env of [{}, { TEXT_TO_CAD_DEV: "1" }]) {
      expect(checkoutEngineEnv(env, "/Users/a")).toEqual(
        studioEngineEnv("/Users/a/.text-to-cad-studio-dev", { dev: true }),
      );
    }
    expect(checkoutEngineEnv({}, "/Users/a").CAD_ENGINE_PORT).not.toBe(String(STUDIO_ENGINE_PORT));
    expect(checkoutEngineEnv({ TEXT_TO_CAD_STUDIO_HOME: "/elsewhere" }, "/Users/a")).toMatchObject({
      CAD_STATE_DIR: "/elsewhere/cad/state",
    });
  });
});

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
    // Its CAD server keeps its state, cache, engine and port apart from a user's own.
    const cad = NodePath.join(studioHome, "cad");
    expect(env).toMatchObject({
      CAD_STATE_DIR: NodePath.join(cad, "state"),
      CAD_CACHE_DIR: NodePath.join(cad, "cache"),
      CAD_ENGINE_DIR: NodePath.join(cad, "engine"),
      CAD_ENGINE_PORT: String(STUDIO_ENGINE_PORT),
      CAD_LAUNCHER_DIR: NodePath.join(studioHome, "bin"),
      // text-to-cad's telemetry is off from the first `cad` command, in any order.
      CAD_INSTALL_CHANNEL: "dev",
    });
    expect(env.PATH).toBe(NodePath.join(studioHome, "bin"));
    const skill = NodeFS.readFileSync(
      NodePath.join(marketplace, "plugins", "text-to-cad", "skills", "cad", "SKILL.md"),
      "utf8",
    );
    expect(skill).toBe(`Run \`${python} -m cad_server.cli snapshot part.step part.png\`.\n`);
    const config = JSON.parse(
      NodeFS.readFileSync(
        NodePath.join(marketplace, "plugins", "text-to-cad", "codex.mcp.json"),
        "utf8",
      ),
    );
    expect(config.mcpServers.cad.command).toBe(python);
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
      `Run \`"${python}" -m cad_server.cli snapshot part.step part.png\`.\n`,
    );
    const config = JSON.parse(NodeFS.readFileSync(NodePath.join(plugin, "codex.mcp.json"), "utf8"));
    expect(config.mcpServers.cad.command).toBe(python);
  });

  it("points the app at its samples folder when the bundle has one", () => {
    const res = resources();
    const samples = NodePath.join(res, "studio", "sample");
    const sample = NodePath.join(samples, "servo-bracket");
    write(
      NodePath.join(sample, "studio-sample.json"),
      '{ "sample": "servo-bracket", "version": 1 }',
    );
    const env: Record<string, string | undefined> = {};
    applyStudioAppBundle({ resourcesPath: res, homeDirectory: tempDir(), env });
    expect(env.T3CODE_SAMPLES_DIR).toBe(samples);
  });

  it("leaves the samples folder unset without one", () => {
    const env: Record<string, string | undefined> = {};
    applyStudioAppBundle({ resourcesPath: resources(), homeDirectory: tempDir(), env });
    expect(env.T3CODE_SAMPLES_DIR).toBeUndefined();
  });

  it("names the bundled library wheel to the CAD tools when the bundle has one", () => {
    const res = resources();
    const wheels = NodePath.join(res, "studio", "wheels");
    write(NodePath.join(wheels, "cad-0.11.3-py3-none-any.whl"), "");
    const env: Record<string, string | undefined> = {};
    applyStudioAppBundle({ resourcesPath: res, homeDirectory: tempDir(), env });
    expect(env.CAD_UPDATE_FIND_LINKS).toBe(wheels);

    const none: Record<string, string | undefined> = {};
    applyStudioAppBundle({ resourcesPath: resources(), homeDirectory: tempDir(), env: none });
    expect(none.CAD_UPDATE_FIND_LINKS).toBeUndefined();
  });

  it("says the versions the build was given, and none it was not", () => {
    const env: Record<string, string | undefined> = {};
    applyStudioAppBundle({
      resourcesPath: resources(undefined, { version: "0.2.0", textToCad: "0.10.3" }),
      homeDirectory: tempDir(),
      env,
    });
    expect(env.T3CODE_APP_VERSION).toBe("0.2.0");
    expect(env.STUDIO_TEXT_TO_CAD_VERSION).toBe("0.10.3");

    const older: Record<string, string | undefined> = {};
    applyStudioAppBundle({ resourcesPath: resources(), homeDirectory: tempDir(), env: older });
    expect(older.T3CODE_APP_VERSION).toBeUndefined();
    expect(older.STUDIO_TEXT_TO_CAD_VERSION).toBeUndefined();

    const bad: Record<string, string | undefined> = {};
    applyStudioAppBundle({
      resourcesPath: resources(undefined, { version: "0.2.0\nmade up", textToCad: 3 }),
      homeDirectory: tempDir(),
      env: bad,
    });
    expect(bad.T3CODE_APP_VERSION).toBeUndefined();
    expect(bad.STUDIO_TEXT_TO_CAD_VERSION).toBeUndefined();
  });

  it("sends usage counts only from a build made with a usage receiver", () => {
    const env: Record<string, string | undefined> = {};
    applyStudioAppBundle({
      resourcesPath: resources(undefined, { usageUrl: "https://usage.example" }),
      homeDirectory: tempDir(),
      env,
    });
    expect(env.T3CODE_USAGE_URL).toBe("https://usage.example");

    const none: Record<string, string | undefined> = {};
    applyStudioAppBundle({ resourcesPath: resources(), homeDirectory: tempDir(), env: none });
    expect(none.T3CODE_USAGE_URL).toBeUndefined();

    const plain: Record<string, string | undefined> = {};
    applyStudioAppBundle({
      resourcesPath: resources(undefined, { usageUrl: "http://usage.example" }),
      homeDirectory: tempDir(),
      env: plain,
    });
    expect(plain.T3CODE_USAGE_URL).toBeUndefined();
  });

  it("leaves what the environment already says", () => {
    const home = tempDir();
    const res = resources();
    write(NodePath.join(res, "studio", "sample", "servo-bracket", "studio-sample.json"), "{}");
    const env: Record<string, string | undefined> = {
      T3CODE_HOME: NodePath.join(home, "elsewhere"),
      T3CODE_SAMPLES_DIR: NodePath.join(home, "my-samples"),
    };
    applyStudioAppBundle({ resourcesPath: res, homeDirectory: home, env });
    expect(env.T3CODE_HOME).toBe(NodePath.join(home, "elsewhere"));
    expect(env.T3CODE_PLUGIN_MARKETPLACE).toBe(
      NodePath.join(home, "elsewhere", "studio-app-plugins"),
    );
    expect(env.T3CODE_SAMPLES_DIR).toBe(NodePath.join(home, "my-samples"));
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
