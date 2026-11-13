import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import {
  CommandAvailability,
  resolveSpawnCommand,
  WindowsShellEnvironment,
} from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Observe the existing synchronous shell probe without launching the user's login shell.
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import { assert, it, vi } from "vite-plus/test";

import { fixPath, hydratePosixHome } from "./os-jank.ts";

vi.mock("node:child_process", { spy: true });

it("hydrates HOME independently of a blank process HOME", () => {
  const originalHome = process.env.HOME;
  const env: NodeJS.ProcessEnv = { HOME: " " };

  try {
    process.env.HOME = " ";
    hydratePosixHome(env);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("preserves an explicitly configured HOME", () => {
  const env: NodeJS.ProcessEnv = { HOME: "/custom/home" };

  hydratePosixHome(env, () => {
    throw new Error("HOME lookup should not run");
  });

  assert.equal(env.HOME, "/custom/home");
});

effectIt.effect("hydrates PATH when the desktop handoff is absent", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      vi
        .spyOn(NodeChildProcess, "execFileSync")
        .mockReturnValue("__T3CODE_ENV_PATH_START__\n/opt/tools/bin\n__T3CODE_ENV_PATH_END__\n"),
    ),
    (probe) =>
      Effect.gen(function* () {
        const env: NodeJS.ProcessEnv = {
          HOME: "/home/testuser",
          SHELL: "/bin/bash",
          PATH: "/usr/bin",
        };

        yield* fixPath().pipe(
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.provideService(HostProcess.Environment, env),
          Effect.provide(NodeServices.layer),
        );

        assert.equal(probe.mock.calls.length, 1);
        assert.equal(env.PATH, "/opt/tools/bin:/usr/bin:/home/testuser/.local/bin");
      }),
    (probe) => Effect.sync(() => probe.mockRestore()),
  ),
);

effectIt.effect.each(["darwin", "linux"] as const)(
  "keeps the user's own place for the installer folder on %s",
  (platform) =>
    Effect.gen(function* () {
      const env: NodeJS.ProcessEnv = {
        HOME: "/home/testuser",
        PATH: "/home/testuser/.local/bin:/usr/bin",
      };

      yield* fixPath({ shellEnvironmentPrepared: true }).pipe(
        Effect.provideService(HostProcess.Platform, platform),
        Effect.provideService(HostProcess.Environment, env),
        Effect.provide(NodeServices.layer),
      );

      assert.equal(env.PATH, "/home/testuser/.local/bin:/usr/bin");
    }),
);

effectIt.effect.skipIf(HostProcess.Platform.defaultValue() === "win32")(
  "launches a CLI the installer adds to ~/.local/bin after startup",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-installer-home-" });
      const env: NodeJS.ProcessEnv = { HOME: home, PATH: "/usr/bin:/bin" };
      // The same bare-name launch the provider status check makes.
      const launch = Effect.gen(function* () {
        const spawnCommand = yield* resolveSpawnCommand("fake-provider-cli", ["--version"], {
          env,
        });
        return yield* spawner.exitCode(
          ChildProcess.make(spawnCommand.command, spawnCommand.args, {
            env,
            shell: spawnCommand.shell,
          }),
        );
      }).pipe(Effect.result);

      yield* fixPath({ shellEnvironmentPrepared: true }).pipe(
        Effect.provideService(HostProcess.Environment, env),
      );
      assert.equal((yield* launch)._tag, "Failure");

      const installDirectory = path.join(home, ".local", "bin");
      yield* fs.makeDirectory(installDirectory, { recursive: true });
      const installed = path.join(installDirectory, "fake-provider-cli");
      yield* fs.writeFileString(installed, "#!/bin/sh\nexit 0\n");
      yield* fs.chmod(installed, 0o755);

      const afterInstall = yield* launch;
      assert.equal(afterInstall._tag, "Success");
      if (afterInstall._tag === "Success") assert.equal(Number(afterInstall.success), 0);
    }).pipe(Effect.provide(NodeServices.layer)),
);

effectIt.effect("leaves PATH alone on platforms without a known installer folder", () =>
  Effect.gen(function* () {
    const env: NodeJS.ProcessEnv = { HOME: "/home/testuser", PATH: "/usr/bin" };

    yield* fixPath().pipe(
      Effect.provideService(HostProcess.Platform, "freebsd"),
      Effect.provideService(HostProcess.Environment, env),
      Effect.provide(NodeServices.layer),
    );

    assert.equal(env.PATH, "/usr/bin");
  }),
);

const timedOut = (file: string) =>
  Object.assign(new Error(`spawnSync ${file} ETIMEDOUT`), { code: "ETIMEDOUT" });

effectIt.effect("waits longer for a login shell that times out at startup", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      vi.spyOn(NodeChildProcess, "execFileSync").mockImplementation((file, _args, options) => {
        // This profile takes 8 seconds while the machine is under load.
        if ((options?.timeout ?? 0) < 8_000) throw timedOut(String(file));
        return "__T3CODE_ENV_PATH_START__\n/opt/tools/bin\n__T3CODE_ENV_PATH_END__\n";
      }),
    ),
    () =>
      Effect.gen(function* () {
        const env: NodeJS.ProcessEnv = {
          HOME: "/home/testuser",
          SHELL: "/bin/zsh",
          PATH: "/usr/bin",
        };

        yield* fixPath().pipe(
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.provideService(HostProcess.Environment, env),
          Effect.provide(NodeServices.layer),
        );

        assert.equal(env.PATH, "/opt/tools/bin:/usr/bin:/home/testuser/.local/bin");
      }),
    (probe) => Effect.sync(() => probe.mockRestore()),
  ),
);

effectIt.effect("waits longer for only one hung login shell", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      vi.spyOn(NodeChildProcess, "execFileSync").mockImplementation((file) => {
        throw timedOut(String(file));
      }),
    ),
    (probe) =>
      Effect.gen(function* () {
        const env: NodeJS.ProcessEnv = {
          HOME: "/home/testuser",
          SHELL: "/bin/zsh",
          PATH: "/usr/bin",
        };

        yield* fixPath().pipe(
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.provideService(HostProcess.Environment, env),
          Effect.provide(NodeServices.layer),
        );

        const timeouts = probe.mock.calls.map(([, , options]) => options?.timeout);
        assert.equal(timeouts.filter((timeout) => (timeout ?? 0) > 5_000).length, 1);
        assert.equal(env.PATH, "/usr/bin:/home/testuser/.local/bin");
      }),
    (probe) => Effect.sync(() => probe.mockRestore()),
  ),
);

effectIt.effect("keeps mise's PATH record with the login shell PATH", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      vi
        .spyOn(NodeChildProcess, "execFileSync")
        .mockReturnValue(
          [
            "__T3CODE_ENV_PATH_START__",
            "/home/me/.local/bin:/mise/installs/claude/latest:/mise/shims",
            "__T3CODE_ENV_PATH_END__",
            "__T3CODE_ENV___MISE_DIFF_START__",
            "mise-diff",
            "__T3CODE_ENV___MISE_DIFF_END__",
          ].join("\n"),
        ),
    ),
    () =>
      Effect.gen(function* () {
        const env: NodeJS.ProcessEnv = { SHELL: "/bin/bash", PATH: "/usr/bin" };

        yield* fixPath().pipe(
          Effect.provideService(HostProcess.Platform, "linux"),
          Effect.provideService(HostProcess.Environment, env),
          Effect.provide(NodeServices.layer),
        );

        assert.equal(env.__MISE_DIFF, "mise-diff");
      }),
    (probe) => Effect.sync(() => probe.mockRestore()),
  ),
);

effectIt.effect("hydrates a missing JAVA_HOME from the login shell and keeps an explicit one", () =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      vi
        .spyOn(NodeChildProcess, "execFileSync")
        .mockReturnValue(
          [
            "__T3CODE_ENV_PATH_START__",
            "/opt/homebrew/bin",
            "__T3CODE_ENV_PATH_END__",
            "__T3CODE_ENV_JAVA_HOME_START__",
            "/opt/homebrew/opt/openjdk@17",
            "__T3CODE_ENV_JAVA_HOME_END__",
          ].join("\n"),
        ),
    ),
    () =>
      Effect.gen(function* () {
        const missing: NodeJS.ProcessEnv = { SHELL: "/bin/zsh", PATH: "/usr/bin" };
        const explicit: NodeJS.ProcessEnv = {
          SHELL: "/bin/zsh",
          PATH: "/usr/bin",
          JAVA_HOME: "/custom/jdk",
        };

        for (const env of [missing, explicit]) {
          yield* fixPath().pipe(
            Effect.provideService(HostProcess.Platform, "darwin"),
            Effect.provideService(HostProcess.Environment, env),
            Effect.provide(NodeServices.layer),
          );
        }

        assert.equal(missing.JAVA_HOME, "/opt/homebrew/opt/openjdk@17");
        assert.equal(explicit.JAVA_HOME, "/custom/jdk");
      }),
    (probe) => Effect.sync(() => probe.mockRestore()),
  ),
);

effectIt.effect("replaces a Path-spelled Windows PATH instead of adding a second key", () =>
  Effect.gen(function* () {
    const env: NodeJS.ProcessEnv = { Path: "C:\\Windows" };

    yield* fixPath().pipe(
      Effect.provideService(HostProcess.Platform, "win32"),
      Effect.provideService(HostProcess.Environment, env),
      Effect.provideService(WindowsShellEnvironment, () => Effect.succeed({ PATH: "C:\\Tools" })),
      Effect.provideService(CommandAvailability, () => Effect.succeed(true)),
      Effect.provide(NodeServices.layer),
    );

    assert.deepEqual(env, { PATH: "C:\\Tools;C:\\Windows" });
  }),
);
