import type { ProviderInstallState, ProviderInstanceConfig } from "@t3tools/contracts";

/**
 * An invite code lets a friend use Studio's Codex on Amy's OpenAI account: Codex sends requests to
 * the invite server with the code as its key, and the server forwards them with Amy's key. It is a
 * Codex instance in "existing" setup mode with the server as provider in its launch arguments and
 * the code as a sensitive instance variable.
 */
export const STUDIO_INVITE_SERVER = "https://studio-invite.vercel.app/v1";
export const STUDIO_INVITE_CODE_ENV = "STUDIO_INVITE_CODE";
const PROVIDER = "studio_invite";

/** The launch arguments of T3's own managed Codex, pointed at the invite server. */
export function inviteLaunchArgs(server = STUDIO_INVITE_SERVER): string {
  return [
    `model_provider="${PROVIDER}"`,
    `model_providers.${PROVIDER}.name="Studio invite"`,
    `model_providers.${PROVIDER}.base_url="${server}"`,
    `model_providers.${PROVIDER}.model_catalog_url="${server}/models"`,
    "features.api_key_model_discovery=true",
    "features.multi_agent=false",
    "features.multi_agent_v2=false",
    `model_providers.${PROVIDER}.env_key="${STUDIO_INVITE_CODE_ENV}"`,
    `model_providers.${PROVIDER}.wire_api="responses"`,
    `model_providers.${PROVIDER}.requires_openai_auth=false`,
    `model_providers.${PROVIDER}.supports_websockets=false`,
  ]
    .map((value) => `-c '${value}'`)
    .join(" ");
}

const configObject = (config: unknown): Record<string, unknown> =>
  config !== null && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};

/** Whether a Codex instance's config runs on an invite code. */
export function usesInvite(config: unknown): boolean {
  const value = configObject(config);
  return (
    value.setupMode === "existing" &&
    typeof value.launchArgs === "string" &&
    value.launchArgs.includes(`model_provider="${PROVIDER}"`)
  );
}

/** A code as it was pasted: spaces, line breaks and quotes dropped, letters capitalized. */
export function normalizedInviteCode(text: string): string {
  return text.replace(/[\s"'`]+/g, "").toUpperCase();
}

export type InviteCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly message: string };

const UNREACHABLE =
  "Could not reach the invite server. Check the internet connection and try again.";

/** Asks the invite server whether a code is on its list. Its refusal is one plain sentence. */
export async function checkInviteCode(
  code: string,
  request: typeof fetch = fetch,
  server = STUDIO_INVITE_SERVER,
): Promise<InviteCheck> {
  try {
    const response = await request(`${server}/invite`, {
      headers: { authorization: `Bearer ${code}` },
    });
    if (response.ok) {
      const body: unknown = await response.json();
      const name = configObject(body).name;
      return { ok: true, name: typeof name === "string" ? name : "" };
    }
    const text = (await response.text()).trim();
    const sentence =
      response.headers.get("content-type")?.startsWith("text/plain") === true &&
      text.length > 0 &&
      text.length < 300;
    return {
      ok: false,
      message: sentence ? text : "This invite code did not work. Check it and try again.",
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

/**
 * The Codex a code can run on without moving it: one that works already on the person's own setup.
 * Null sends the dialog to Studio's installer, which needs the instance on Studio's own setup, a
 * move that would sign out a working Codex if the install then failed or was cancelled.
 */
export function workingCodexBinary(config: unknown, ready: boolean): string | null {
  const value = configObject(config);
  if (!ready || value.setupMode === "managed") return null;
  return typeof value.binaryPath === "string" && value.binaryPath.trim().length > 0
    ? value.binaryPath
    : "codex";
}

/**
 * The instance on an invite: Codex from `binaryPath`, its requests to the invite server. The setup
 * it came from stays in `beforeInvite`, so that leaving the code finds it signed in as it was.
 */
export function inviteInstance(
  instance: ProviderInstanceConfig,
  code: string,
  binaryPath: string,
): ProviderInstanceConfig {
  const config = configObject(instance.config);
  return {
    ...instance,
    enabled: true,
    config: {
      ...config,
      enabled: true,
      setupMode: "existing",
      binaryPath,
      launchArgs: inviteLaunchArgs(),
      beforeInvite: config.beforeInvite ?? config,
    },
    environment: [
      ...(instance.environment ?? []).filter(
        (variable) => variable.name !== STUDIO_INVITE_CODE_ENV,
      ),
      { name: STUDIO_INVITE_CODE_ENV, value: code, sensitive: true },
    ],
  };
}

/**
 * The instance off its code, on the setup it came from. With none saved, as for a code used before
 * Studio kept one, and for the dialog on its way to the installer, it goes on Studio's own setup,
 * where ChatGPT signs in and Codex is installed. The binary path goes too: managed setup only
 * installs Codex for an instance without one.
 */
export function instanceWithoutInvite(instance: ProviderInstanceConfig): ProviderInstanceConfig {
  const {
    binaryPath: _binaryPath,
    launchArgs: _launchArgs,
    beforeInvite,
    ...config
  } = configObject(instance.config);
  return {
    ...instance,
    enabled: true,
    config:
      beforeInvite === undefined
        ? { ...config, enabled: true, setupMode: "managed" }
        : { ...configObject(beforeInvite), enabled: true },
    environment: (instance.environment ?? []).filter(
      (variable) => variable.name !== STUDIO_INVITE_CODE_ENV,
    ),
  };
}

type Installation = Pick<
  ProviderInstallState,
  "operationId" | "phase" | "installedVersion" | "executablePath" | "message"
>;

export type InviteInstallStep =
  | { readonly kind: "ready"; readonly binaryPath: string }
  | { readonly kind: "install" }
  | { readonly kind: "wait" }
  | { readonly kind: "failed"; readonly message: string };

const running = (phase: Installation["phase"]) =>
  phase === "downloading" || phase === "extracting" || phase === "verifying";

/**
 * What the invite does next about Codex itself: use the one installed (Studio's, or one already on
 * this computer), install it, or wait. `started` is the operation the install started (null when it
 * found Codex already there), undefined before it starts; only that operation's failure counts,
 * since the state can still show an earlier attempt's.
 */
export function inviteInstallStep(
  installation: Installation | null | undefined,
  started: string | null | undefined,
): InviteInstallStep {
  if (!installation || running(installation.phase)) return { kind: "wait" };
  if (installation.installedVersion && installation.executablePath)
    return { kind: "ready", binaryPath: installation.executablePath };
  if (started === undefined) return { kind: "install" };
  if (
    installation.operationId === started &&
    (installation.phase === "failed" || installation.phase === "cancelled")
  )
    return {
      kind: "failed",
      message: installation.message ?? "Codex could not be installed. Try again.",
    };
  return { kind: "wait" };
}

/** The install's progress, in the words of the ChatGPT setup's own line. */
export function inviteInstallProgress(
  installation: Pick<ProviderInstallState, "phase" | "downloadedBytes" | "totalBytes"> | null,
): string {
  if (installation?.phase === "downloading")
    return `Downloading ${(installation.downloadedBytes / 1_000_000).toFixed(1)}${installation.totalBytes === null ? "" : ` of ${(installation.totalBytes / 1_000_000).toFixed(1)}`} MB.`;
  if (installation?.phase === "extracting") return "Installing Codex.";
  if (installation?.phase === "verifying") return "Checking Codex.";
  return "Getting Codex ready.";
}
