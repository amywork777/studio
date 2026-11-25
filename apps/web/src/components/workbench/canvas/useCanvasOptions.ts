import { pluginFileHandlers } from "@t3tools/client-runtime/state/plugins";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { useThreadShell } from "~/state/entities";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { cadHttpArguments } from "../partContext";
import { type DesignOption, OPTIONS_FILE, readDesignOptions } from "./canvasOptions";

/** How often the options file is read while the agent is building. */
const READ_MS = 2500;

/** Whether the board's chat has a turn running. */
export function useBoardWorking(environmentId: EnvironmentId, threadId: string | null): boolean {
  const shell = useThreadShell(
    threadId === null ? null : scopeThreadRef(environmentId, threadId as ThreadId),
  );
  return shell !== null && shell.latestRun !== null && isThreadWorking(shell);
}

/**
 * The options the board's agent has listed so far (`canvas/options.json`), read again every few
 * seconds while it works and once more when it stops. `stamp` moves whenever the file changes, so
 * an option built again draws its new mesh.
 */
export function useBoardOptions(input: {
  readonly environmentId: EnvironmentId;
  readonly folder: string | null;
  readonly working: boolean;
}): { readonly options: ReadonlyArray<DesignOption>; readonly stamp: string } {
  const { environmentId, folder, working } = input;
  const read = useAtomQueryRunner(projectEnvironment.readFile, { reportFailure: false });
  const [state, setState] = useState<{
    readonly folder: string;
    readonly options: ReadonlyArray<DesignOption>;
    readonly stamp: string;
  } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the agent's options file from the server while its turn runs
  useEffect(() => {
    if (folder === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const once = async () => {
      const result = await read({
        environmentId,
        input: { cwd: folder, relativePath: OPTIONS_FILE },
      });
      if (cancelled) return;
      if (result._tag === "Success") {
        const options = readDesignOptions(result.value.contents);
        const stamp = String(result.value.modifiedAt ?? result.value.contents.length);
        if (options !== null) {
          setState((last) =>
            last !== null && last.folder === folder && last.stamp === stamp
              ? last
              : { folder, options, stamp },
          );
        }
      }
      if (working) timer = setTimeout(() => void once(), READ_MS);
    };
    void once();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [environmentId, folder, working, read]);
  return state !== null && state.folder === folder
    ? { options: state.options, stamp: state.stamp }
    : { options: [], stamp: "" };
}

/** A `cad_http` reply's body as bytes: base64, gzipped when large. Null for anything but a 200. */
async function tunnelBytes(result: unknown): Promise<ArrayBuffer | null> {
  const reply =
    typeof result === "object" && result !== null && "structuredContent" in result
      ? (result as { structuredContent: unknown }).structuredContent
      : null;
  if (typeof reply !== "object" || reply === null) return null;
  const { status, body, encoding } = reply as {
    status?: unknown;
    body?: unknown;
    encoding?: unknown;
  };
  if (status !== 200 || typeof body !== "string") return null;
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  if (encoding !== "gzip") return bytes.buffer;
  return new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
}

/**
 * A mesh file's bytes from Studio's CAD service (`/api/v1/local/files`, which sends CAD files by
 * path), through the CAD plugin's `cad_http` as the CAD view asks it. Null until it arrives and
 * while the file is not there yet; read again when `stamp` moves.
 */
export function useMeshBytes(input: {
  readonly environmentId: EnvironmentId;
  readonly path: string | null;
  readonly stamp: string;
}): ArrayBuffer | null {
  const { environmentId, path, stamp } = input;
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const request = useAtomCommand(pluginEnvironment.request, { reportFailure: false });
  const viewer = plugins === undefined ? undefined : pluginFileHandlers(plugins, "part.step")[0];
  const pluginId = viewer?.pluginId ?? null;
  const server = viewer?.view.server ?? null;
  const [state, setState] = useState<{ readonly path: string; readonly bytes: ArrayBuffer } | null>(
    null,
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- fetches the mesh's bytes from the CAD service when its file changes
  useEffect(() => {
    if (path === null || pluginId === null || server === null) return;
    let cancelled = false;
    const url = `/api/v1/local/files?path=${encodeURIComponent(path)}&v=${encodeURIComponent(stamp)}`;
    void request({
      environmentId,
      input: {
        threadId: null,
        pluginId,
        server,
        method: "tools/call",
        params: { name: "cad_http", arguments: cadHttpArguments(url) },
      },
    })
      .then((result) => (result._tag === "Success" ? tunnelBytes(result.value.result) : null))
      .then((bytes) => {
        if (!cancelled && bytes !== null) setState({ path, bytes });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [environmentId, path, stamp, pluginId, server, request]);
  // A mesh built again keeps its last bytes on the card until the new ones arrive.
  return state !== null && state.path === path ? state.bytes : null;
}
