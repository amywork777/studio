import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { create } from "zustand";

import { useThreadShell } from "~/state/entities";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { cadHttpArguments, readTunnelJson } from "./partContext";
import type { Comparison, PartVersion } from "./versions";

/** A POST to Studio's CAD service, answered with the route's JSON (null when it could not be asked). */
export type CadPost = (path: string, body: unknown) => Promise<unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Studio's CAD service (text-to-cad's viewer server, `cad_server/viewer/http_app.py`), asked through the
 * CAD plugin's `cad_http` tool for the thread's own server, as the CAD view asks it. A new chat is a
 * draft the server has no record of, so it asks the environment's own server instead. Null while
 * the plugins load, or when none opens STEP files.
 */
export function useCadService(threadRef: ScopedThreadRef): CadPost | null {
  const saved = useThreadShell(threadRef) !== null;
  return useCadPost(
    threadRef.environmentId,
    saved ? { threadId: threadRef.threadId } : ENVIRONMENT_SCOPE,
  );
}

/**
 * Studio's CAD service as the environment's own CAD server asks it, for work that belongs to no
 * thread yet: a new chat is a draft the server has no record of, and New part builds its part
 * before anything is sent there. Null while the plugins load, or when none opens STEP files.
 */
export function useEnvironmentCadService(environmentId: EnvironmentId | null): CadPost | null {
  return useCadPost(environmentId, environmentId === null ? null : ENVIRONMENT_SCOPE);
}

const ENVIRONMENT_SCOPE = { threadId: null } as const;

/** A GET of Studio's CAD service's route `url`, answered with its JSON (null when it could not be asked). */
export type CadGet = (url: string) => Promise<unknown>;

/** A read of Studio's CAD service's routes as the environment's own CAD server asks it (`useEnvironmentCadService`). */
export function useEnvironmentCadGet(environmentId: EnvironmentId | null): CadGet | null {
  const plugins = useEnvironmentQuery(
    environmentId === null ? null : pluginEnvironment.list({ environmentId, input: {} }),
  ).data?.plugins;
  const request = useAtomCommand(pluginEnvironment.request, { reportFailure: false });
  const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, "part.step")[0];
  const pluginId = viewer?.pluginId ?? null;
  const server = viewer?.view.server ?? null;
  const get: CadGet = async (url) => {
    if (environmentId === null || pluginId === null || server === null) return null;
    const result = await request({
      environmentId,
      input: {
        threadId: null,
        pluginId,
        server,
        method: "tools/call",
        params: { name: "cad_http", arguments: cadHttpArguments(url) },
      },
    });
    return result._tag === "Success" ? readTunnelJson(result.value.result).catch(() => null) : null;
  };
  return environmentId === null || pluginId === null || server === null ? null : get;
}

function useCadPost(
  environmentId: EnvironmentId | null,
  scope: { readonly threadId: ThreadId | null } | null,
): CadPost | null {
  const plugins = useEnvironmentQuery(
    environmentId === null ? null : pluginEnvironment.list({ environmentId, input: {} }),
  ).data?.plugins;
  const request = useAtomCommand(pluginEnvironment.request, { reportFailure: false });
  const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, "part.step")[0];
  const pluginId = viewer?.pluginId ?? null;
  const server = viewer?.view.server ?? null;
  const threadId = scope?.threadId ?? null;
  const asked = scope !== null;
  const post: CadPost = async (path, body) => {
    if (environmentId === null || pluginId === null || server === null || !asked) return null;
    const result = await request({
      environmentId,
      input: {
        threadId,
        pluginId,
        server,
        method: "tools/call",
        params: { name: "cad_http", arguments: cadHttpArguments(path, body) },
      },
    });
    return result._tag === "Success" ? readTunnelJson(result.value.result).catch(() => null) : null;
  };
  return pluginId === null || server === null || !asked ? null : post;
}

const failure = (reply: unknown) =>
  isRecord(reply) && typeof reply.error === "string"
    ? reply.error
    : "Studio's CAD service did not answer.";

interface VersionsState {
  readonly versions: ReadonlyArray<PartVersion> | null;
  readonly error: string | null;
}

/**
 * The versions of one file of a project folder (`cadgen/edit/versions.py`), oldest first, read
 * again whenever the thread's agent changes files. The last list stays shown while it is read.
 */
export function usePartVersions(input: {
  readonly post: CadPost | null;
  readonly folder: string;
  readonly path: string | null;
  readonly mutationId: string | null;
}): VersionsState | null {
  const { post, folder, path, mutationId } = input;
  const [state, setState] = useState<(VersionsState & { readonly key: string }) | null>(null);
  const key = `${folder}\n${path ?? ""}`;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the file's versions from the CAD service again on every workspace change
  useEffect(() => {
    if (post === null || path === null) return;
    let cancelled = false;
    void post("/api/v1/local/versions", { folder, path }).then((reply) => {
      if (cancelled) return;
      setState(
        isRecord(reply) && reply.ok === true && Array.isArray(reply.versions)
          ? { key, versions: reply.versions as PartVersion[], error: null }
          : { key, versions: null, error: failure(reply) },
      );
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `mutationId` is the agent changing files: the versions are read again.
  }, [folder, key, mutationId, path, post]);
  return state !== null && state.key === key ? state : null;
}

/**
 * Restores a version of a file (`cadgen/edit/versions.py` `restore`): the file and what it is
 * built from, written over the files on disk, what was there kept as a version first. Resolves to
 * the files written (paths in the folder) and the kept version, or the CAD service's reason.
 */
export async function restoreVersion(
  post: CadPost,
  input: { readonly folder: string; readonly path: string; readonly version: string },
): Promise<
  | { readonly restored: ReadonlyArray<string>; readonly kept: string | null }
  | { readonly error: string }
> {
  const reply = await post("/api/v1/local/versions/restore", input);
  if (isRecord(reply) && reply.ok === true && Array.isArray(reply.restored)) {
    return {
      restored: reply.restored.filter((path): path is string => typeof path === "string"),
      kept: typeof reply.kept === "string" ? reply.kept : null,
    };
  }
  return { error: failure(reply) };
}

interface ComparisonState {
  readonly comparison: Comparison | null;
  readonly error: string | null;
}

/**
 * What changed in a file between two versions (`cadgen/edit/versions.py` `compare`), asked again
 * while the CAD service compares the solids in a process of its own. `retry` compares them again
 * after a failure.
 */
export function useComparison(input: {
  readonly post: CadPost | null;
  readonly folder: string;
  readonly path: string;
  readonly older: string | null;
  readonly newer: string | null;
  /** A model's name when `path` is its script: its solids are then built at both versions. */
  readonly model: string | null;
  /** Text files to read at both versions too: the part's check results. */
  readonly texts: ReadonlyArray<string>;
}): { readonly state: ComparisonState | null; readonly retry: () => void } {
  const { post, folder, path, older, newer, model } = input;
  const texts = input.texts.join("\n");
  const [state, setState] = useState<(ComparisonState & { readonly key: string }) | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = [folder, path, older ?? "", newer ?? "", model ?? "", texts].join("\n");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls the CAD service's comparison on a timer while it is still working
  useEffect(() => {
    if (post === null || older === null || newer === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = (retry: boolean) =>
      post("/api/v1/local/versions/compare", {
        folder,
        path,
        older,
        newer,
        ...(model === null ? {} : { model }),
        texts: texts === "" ? [] : texts.split("\n"),
        retry,
      }).then((reply) => {
        if (cancelled) return;
        if (!isRecord(reply) || reply.ok !== true || !isRecord(reply.shape)) {
          setState({ key, comparison: null, error: failure(reply) });
          return;
        }
        const comparison = reply as unknown as Comparison;
        setState({ key, comparison, error: null });
        if (comparison.shape.status === "working") {
          timer = setTimeout(() => void ask(false), comparison.shape.retryMs);
        }
      });
    void ask(attempt > 0);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [attempt, folder, key, model, newer, older, path, post, texts]);
  const retry = () => setAttempt((count) => count + 1);
  return { state: state !== null && state.key === key ? state : null, retry };
}

/** A part to show the versions of, asked for from outside the Overview: a Changed chip in the chat. */
export interface VersionRequest {
  /** The project folder the part is in. */
  readonly folder: string;
  /** The part's file, in that folder. */
  readonly path: string;
  /** The checkpoint of the turn that changed it: its version is compared with the one before. */
  readonly ref: string;
}

/**
 * The Changed chips ask, and the Overview's Versions takes the request (`PartVersions`). The
 * project switcher's Version history only asks it to show itself (`reveal`), taken when it next
 * shows, within a few seconds.
 */
export const useVersionRequestStore = create<{
  readonly request: VersionRequest | null;
  readonly ask: (request: VersionRequest) => void;
  readonly take: () => void;
  /** When Version history was last asked for; null once shown. */
  readonly revealAt: number | null;
  readonly reveal: () => void;
  readonly revealed: () => void;
}>()((set) => ({
  request: null,
  ask: (request) => set({ request }),
  take: () => set({ request: null }),
  revealAt: null,
  reveal: () => set({ revealAt: Date.now() }),
  revealed: () => set({ revealAt: null }),
}));
