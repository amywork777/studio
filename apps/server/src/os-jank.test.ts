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

it("hydrates HOME for minimal service environments from the user account", () => {
  const env: NodeJS.ProcessEnv = {};

  hydratePosixHome(env);

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

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

effectIt.effect.each(["darwin", "linux"] as const)(
  "keeps the prepared PATH and still hydrates HOME on %s",
  (platform) =>
    Effect.acquireUseRelease(
      Effect.sync(() => vi.spyOn(NodeChildProcess, "execFileSync")),
      (probe) =>
        Effect.gen(function* () {
          probe.mockImplementation(() => {
            throw new Error("The prepared environment must not launch another shell");
          });
          const env: NodeJS.ProcessEnv = { PATH: "/prepared/bin:/usr/bin" };

          yield* fixPath({ shellEnvironmentPrepared: true }).pipe(
            Effect.provideService(HostProcess.Platform, platform),
            Effect.provideService(HostProcess.Environment, env),
            Effect.provide(NodeServices.layer),
          );

          assert.equal(probe.mock.calls.length, 0);
          assert.equal(env.PATH, `/prepared/bin:/usr/bin:${NodeOS.userInfo().homedir}/.local/bin`);
          assert.equal(env.HOME, NodeOS.userInfo().homedir);
        }),
      (probe) => Effect.sync(() => probe.mockRestore()),
    ),
);

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

effectIt.effect("repairs Windows PATH even when the desktop marks it prepared", () =>
  Effect.gen(function* () {
    const env: NodeJS.ProcessEnv = { PATH: "C:\\Windows" };
    const commands: string[] = [];

    yield* fixPath({ shellEnvironmentPrepared: true }).pipe(
      Effect.provideService(HostProcess.Platform, "win32"),
      Effect.provideService(HostProcess.Environment, env),
      Effect.provideService(WindowsShellEnvironment, () => ({ PATH: "C:\\Tools" })),
      Effect.provideService(CommandAvailability, (command) =>
        Effect.sync(() => {
          commands.push(command);
          return true;
        }),
      ),
      Effect.provide(NodeServices.layer),
    );

    assert.deepEqual(commands, ["node"]);
    assert.equal(env.PATH, "C:\\Tools;C:\\Windows");
  }),
);
