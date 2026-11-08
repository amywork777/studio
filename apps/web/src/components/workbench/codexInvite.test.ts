import { CodexSettings, ProviderDriverKind, type ProviderInstanceConfig } from "@t3tools/contracts";
import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";
import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  checkInviteCode,
  instanceWithoutInvite,
  inviteInstallProgress,
  inviteInstallStep,
  inviteInstance,
  inviteLaunchArgs,
  normalizedInviteCode,
  STUDIO_INVITE_CODE_ENV,
  usesInvite,
  workingCodexBinary,
} from "./codexInvite";

const decodeCodexSettings = Schema.decodeUnknownSync(CodexSettings);
const codex = ProviderDriverKind.make("codex");
const managed: ProviderInstanceConfig = {
  driver: codex,
  enabled: true,
  config: { enabled: true, setupMode: "managed", homePath: "~/.codex-studio" },
  environment: [{ name: "HTTPS_PROXY", value: "http://proxy:8080", sensitive: false }],
};
const binary = "/Users/sam/.t3/tools/codex/0.156.1/bin/codex";

const answer = (status: number, body: string, contentType: string) => async () =>
  new Response(body, { status, headers: { "content-type": contentType } });

describe("invite code", () => {
  it("points Codex at the invite server, with the code as its key, in arguments T3 splits whole", () => {
    const args = tokenizeCliArgs(inviteLaunchArgs("https://invite.example/v1"));
    const settings = args.filter((_, index) => index % 2 === 1);
    expect(args.filter((_, index) => index % 2 === 0).every((flag) => flag === "-c")).toBe(true);
    expect(settings).toContain('model_provider="studio_invite"');
    expect(settings).toContain(
      'model_providers.studio_invite.base_url="https://invite.example/v1"',
    );
    expect(settings).toContain(
      'model_providers.studio_invite.model_catalog_url="https://invite.example/v1/models"',
    );
    expect(settings).toContain(`model_providers.studio_invite.env_key="${STUDIO_INVITE_CODE_ENV}"`);
    expect(settings).toContain("model_providers.studio_invite.requires_openai_auth=false");
  });

  it("puts an instance on the code and the Codex given, and takes it back off", () => {
    const invited = inviteInstance(managed, "STUDIO-AAAA-BBBB-CCCC", binary);
    expect(usesInvite(invited.config)).toBe(true);
    expect(invited.config).toMatchObject({ setupMode: "existing", binaryPath: binary });
    expect(invited.environment).toEqual([
      managed.environment![0],
      { name: STUDIO_INVITE_CODE_ENV, value: "STUDIO-AAAA-BBBB-CCCC", sensitive: true },
    ]);
    // A new code replaces the old one.
    const again = inviteInstance(invited, "STUDIO-DDDD-EEEE-FFFF", binary);
    expect(
      again.environment?.filter((variable) => variable.name === STUDIO_INVITE_CODE_ENV),
    ).toEqual([{ name: STUDIO_INVITE_CODE_ENV, value: "STUDIO-DDDD-EEEE-FFFF", sensitive: true }]);

    const back = instanceWithoutInvite(invited);
    expect(usesInvite(back.config)).toBe(false);
    expect(back.config).toEqual(managed.config);
    expect(back.environment).toEqual(managed.environment);
  });

  it("leaves a code for the setup it came from, still signed in", () => {
    const own = {
      driver: managed.driver,
      enabled: true,
      config: { enabled: true, binaryPath: "/opt/bin/codex", launchArgs: "-c 'model=\"x\"'" },
    };
    const invited = inviteInstance(own, "STUDIO-AAAA-BBBB-CCCC", "/opt/bin/codex");
    expect(usesInvite(invited.config)).toBe(true);
    // The driver reads the same settings it did, with the saved setup beside them.
    expect(decodeCodexSettings(invited.config).setupMode).toBe("existing");

    const again = inviteInstance(invited, "STUDIO-DDDD-EEEE-FFFF", "/opt/bin/codex");
    const back = instanceWithoutInvite(again);
    expect(back.config).toEqual(own.config);
    expect(back.environment).toEqual([]);
  });

  it("goes to Studio's own setup when no setup was saved", () => {
    const { beforeInvite: _beforeInvite, ...saved } = inviteInstance(managed, "CODE", binary)
      .config as Record<string, unknown>;
    expect(instanceWithoutInvite({ ...managed, config: saved }).config).toMatchObject({
      setupMode: "managed",
    });
    expect(instanceWithoutInvite(managed).config).toEqual(managed.config);
  });

  it("uses a working Codex where it is, and leaves the rest to the installer", () => {
    expect(workingCodexBinary({ binaryPath: "/opt/bin/codex" }, true)).toBe("/opt/bin/codex");
    expect(workingCodexBinary({ setupMode: "existing" }, true)).toBe("codex");
    expect(workingCodexBinary({}, true)).toBe("codex");
    expect(workingCodexBinary({}, false)).toBeNull();
    expect(workingCodexBinary({ setupMode: "managed" }, true)).toBeNull();
  });

  it("knows an invite only by its provider, not by any command-line Codex", () => {
    expect(usesInvite(managed.config)).toBe(false);
    expect(usesInvite({})).toBe(false);
    expect(usesInvite(undefined)).toBe(false);
    expect(usesInvite({ setupMode: "existing", launchArgs: "-c 'model=\"gpt-6-sol\"'" })).toBe(
      false,
    );
  });

  it("reads a code however it was pasted", () => {
    expect(normalizedInviteCode('  "studio-abcd-efgh-jkmn"\n')).toBe("STUDIO-ABCD-EFGH-JKMN");
    expect(normalizedInviteCode("STUDIO - ABCD - EFGH - JKMN")).toBe("STUDIO-ABCD-EFGH-JKMN");
  });

  it("takes the server's word on a code, and says plainly when the server can't be reached", async () => {
    expect(
      await checkInviteCode("C", answer(200, '{"ok":true,"name":"sam"}', "application/json")),
    ).toEqual({ ok: true, name: "sam" });
    expect(
      await checkInviteCode(
        "C",
        answer(
          400,
          "This invite code is not active. Ask Amy for a new one.",
          "text/plain; charset=utf-8",
        ),
      ),
    ).toEqual({ ok: false, message: "This invite code is not active. Ask Amy for a new one." });
    // A page that is not the server's own sentence is not shown.
    expect(
      await checkInviteCode("C", answer(404, "<!doctype html><title>404</title>", "text/html")),
    ).toEqual({
      ok: false,
      message: "This invite code did not work. Check it and try again.",
    });
    const offline = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await checkInviteCode("C", offline)).toEqual({
      ok: false,
      message: "Could not reach the invite server. Check the internet connection and try again.",
    });
  });
});

describe("Codex for an invite", () => {
  const state = {
    operationId: null,
    phase: "idle" as const,
    installedVersion: null,
    executablePath: null,
    message: null,
  };

  it("uses the Codex already here, or installs it once and waits", () => {
    expect(inviteInstallStep(null, undefined)).toEqual({ kind: "wait" });
    expect(
      inviteInstallStep(
        { ...state, installedVersion: "0.156.1", executablePath: binary },
        undefined,
      ),
    ).toEqual({ kind: "ready", binaryPath: binary });
    expect(inviteInstallStep(state, undefined)).toEqual({ kind: "install" });
    expect(
      inviteInstallStep({ ...state, phase: "downloading", operationId: "op-1" }, "op-1"),
    ).toEqual({
      kind: "wait",
    });
  });

  it("counts only its own install's failure, not an earlier one's", () => {
    const earlier = {
      ...state,
      phase: "failed" as const,
      operationId: "op-0",
      message: "No disk space.",
    };
    expect(inviteInstallStep(earlier, undefined)).toEqual({ kind: "install" });
    expect(inviteInstallStep(earlier, "op-1")).toEqual({ kind: "wait" });
    expect(inviteInstallStep({ ...earlier, operationId: "op-1" }, "op-1")).toEqual({
      kind: "failed",
      message: "No disk space.",
    });
  });

  it("says how the install is going", () => {
    expect(
      inviteInstallProgress({
        phase: "downloading",
        downloadedBytes: 12_340_000,
        totalBytes: 45_600_000,
      }),
    ).toBe("Downloading 12.3 of 45.6 MB.");
    expect(
      inviteInstallProgress({ phase: "extracting", downloadedBytes: 0, totalBytes: null }),
    ).toBe("Installing Codex.");
  });
});
