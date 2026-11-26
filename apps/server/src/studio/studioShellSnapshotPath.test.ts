import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { describe, expect } from "vite-plus/test";

import { makeApplyDesktopShellEnvironmentSnapshot } from "../resourceTelemetry/DesktopTelemetryReceiver.ts";

describe("Studio's cad after the desktop's shell environment", () => {
  it.effect("stays first on PATH when a snapshot rebuilds PATH from the login shell", () =>
    Effect.gen(function* () {
      const environment: NodeJS.ProcessEnv = {
        CAD_LAUNCHER_DIR: "/studio/home/bin",
        PATH: "/studio/home/bin:/usr/bin",
      };
      yield* makeApplyDesktopShellEnvironmentSnapshot(
        environment,
        "darwin",
      )({
        version: 1,
        type: "shellEnvironment",
        platform: "darwin",
        discovered: true,
        environment: { PATH: "/Users/someone/.local/bin:/usr/bin" },
      });
      expect(environment.PATH).toBe("/studio/home/bin:/Users/someone/.local/bin:/usr/bin");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
