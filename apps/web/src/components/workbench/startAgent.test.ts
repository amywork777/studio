import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerSettings,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { missingAgent } from "./startAgent";

const provider = (driver: string, overrides: Partial<ServerProvider> = {}): ServerProvider => ({
  driver: ProviderDriverKind.make(driver),
  instanceId: ProviderInstanceId.make(driver),
  enabled: true,
  installed: true,
  status: "ready",
  auth: { status: "authenticated" },
  version: null,
  checkedAt: "2026-01-01T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  ...overrides,
});

/** Installed, not signed in, with a way to sign in from Settings. */
const signedOut = (driver: string) =>
  provider(driver, {
    status: "error",
    auth: { status: "unauthenticated" },
    setup: { canAuthenticate: true, canInstall: false },
  });

const config = (
  providers: ReadonlyArray<ServerProvider>,
  settings: Partial<ServerSettings> = {},
) => ({ providers, settings: { ...DEFAULT_SERVER_SETTINGS, ...settings } });

describe("whether Home's Start has an AI agent to send to", () => {
  it("has one when an agent is signed in", () => {
    expect(missingAgent(config([signedOut("claudeAgent"), provider("codex")]), null)).toBeNull();
  });

  it("has none when no agent is signed in, and names the one to set up", () => {
    expect(
      missingAgent(config([provider("cursor", { status: "error" }), signedOut("codex")]), null),
    ).toEqual({ setup: "codex" });
  });

  it("has none when the only signed-in agent is turned off or not on this computer", () => {
    const off = {
      providerInstances: {
        [ProviderInstanceId.make("codex")]: {
          driver: ProviderDriverKind.make("codex"),
          enabled: false,
        },
      },
    };
    expect(missingAgent(config([provider("codex")], off), null)).toEqual({ setup: undefined });
    expect(
      missingAgent(config([provider("codex", { availability: "unavailable" })]), null),
    ).toEqual({ setup: undefined });
  });

  it("has none when there are no agents at all", () => {
    expect(missingAgent(config([]), null)).toEqual({ setup: undefined });
  });

  it("does not say so before the agents are known", () => {
    expect(missingAgent(null, null)).toBeNull();
  });

  it("does not stop an agent still being checked", () => {
    expect(missingAgent(config([provider("codex", { status: "warning" })]), null)).toBeNull();
  });

  it("goes by the project the chat would be in, where it turns an agent off", () => {
    const id = ProjectId.make("project-1");
    const settings: Partial<ServerSettings> = {
      projectSettingsOverrides: {
        [id]: { providerInstances: { [ProviderInstanceId.make("codex")]: { enabled: false } } },
      },
    };
    const known = config([provider("codex")], settings);
    expect(missingAgent(known, null)).toBeNull();
    expect(missingAgent(known, { id })).not.toBeNull();
  });
});
