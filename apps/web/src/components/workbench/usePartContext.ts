import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useAtomCommand } from "~/state/use-atom-command";
import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";

import {
  buildPollUrl,
  cadHttpArguments,
  describePart,
  documentApi,
  documentOf,
  type PartContext,
  partBuild,
  readDocumentKind,
  readDocumentName,
  readOpenedDocument,
  readMaterials,
  readTunnelJson,
  readUpdated,
  sharedLoad,
  type ShownView,
} from "./partContext";
import { useShownView } from "./shownModels";
import { noteModelTitle } from "./useFolderModels";

/** What the engine and Recents say about one revision of a document. */
interface FileFacts {
  readonly key: string;
  readonly path: string;
  readonly kind: string | null;
  readonly name: string | null;
  /** Null when the document could not be read, or the engine holds none of it yet. */
  readonly materials: ReadonlyArray<string> | null;
  /** Its build (`/version`), null where it has none to read. */
  readonly version: unknown;
  readonly updated: number | null;
}

/** What the routes answered for one revision. */
interface Read {
  readonly structure: unknown;
  readonly version: unknown;
  readonly recents: unknown;
}

/** The routes' reads under way, by thread and revision (`sharedLoad`). */
const FACTS_IN_FLIGHT = new Map<string, Promise<Read>>();
/** The shown models' build-state asks under way, by thread and ask (`sharedLoad`): one per view. */
const BUILDS_IN_FLIGHT = new Map<string, Promise<unknown>>();
/** How long to wait before asking again after an ask that was not answered (the engine away). */
const BUILD_RETRY_MS = 5_000;

const factsKey = (shown: ShownView) =>
  [shown.pluginId, shown.server, shown.path, shown.revision].join("\n");

/**
 * The part the thread's viewer shows. Which document and its revision come with
 * the view's own sync; what it is, its materials, its build and when it last
 * changed are read once per revision through the viewer's routes. Null until
 * the viewer has shown a model this session.
 */
export function usePartContext(
  threadRef: ScopedThreadRef,
  root: string | null = null,
): {
  readonly part: PartContext;
  readonly pluginId: string;
} | null {
  const shown = useShownView(threadRef);
  const request = useAtomCommand(pluginEnvironment.request, { reportFailure: false });
  const [facts, setFacts] = useState<FileFacts | null>(null);
  const [live, setLive] = useState<{ readonly id: string; readonly reply: unknown } | null>(null);
  const key = shown === null ? null : factsKey(shown);
  const route = (view: ShownView) => async (url: string, body?: unknown) => {
    const result = await request({
      environmentId: threadRef.environmentId,
      input: {
        threadId: threadRef.threadId,
        pluginId: view.pluginId,
        server: view.server,
        method: "tools/call",
        params: { name: "cad_http", arguments: cadHttpArguments(url, body) },
      },
    });
    return result._tag === "Success" ? readTunnelJson(result.value.result).catch(() => null) : null;
  };
  const model = shown !== null && isDocumentId(shown.path) ? shown : null;
  const modelKey = model === null ? null : [model.pluginId, model.server, model.path].join("\n");

  // A shown model's build state is long-polled, shared by every caller showing it. A plugin request
  // can't be called off, so a view that goes leaves its last ask to end within `BUILD_WAIT_SECONDS`.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- long-polls the CAD server's build state for the shown model until it goes
  useEffect(() => {
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `modelKey` names the model `model` holds; its revision moving must not restart the ask.
    if (model === null || modelKey === null) return;
    let cancelled = false;
    const ask = route(model);
    void (async () => {
      let last: unknown = null;
      while (!cancelled) {
        const url = buildPollUrl(model.path, last);
        const reply = await sharedLoad(
          BUILDS_IN_FLIGHT,
          [threadRef.environmentId, threadRef.threadId, modelKey, url].join("\n"),
          () => ask(url),
        );
        if (cancelled) return;
        if (reply === null || typeof reply !== "object") {
          await new Promise((resolve) => setTimeout(resolve, BUILD_RETRY_MS));
          continue;
        }
        last = reply;
        setLive({ id: model.path, reply });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelKey, request, threadRef.environmentId, threadRef.threadId]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the shown document's facts from the CAD server's routes once per revision
  useEffect(() => {
    if (shown === null || key === null) return;
    let cancelled = false;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `key` names the document and revision `shown` holds; a sync that changes nothing else must not read them again.
    const get = route(shown);
    // Every caller showing this revision shares one read of the routes (`sharedLoad`).
    const load = async (): Promise<Read> => {
      const target = documentOf(shown.path);
      // A STEP or an xbf is opened, which has the engine read it: null while it does.
      const opened =
        target === null
          ? null
          : "id" in target
            ? { id: target.id, kind: "model" }
            : readOpenedDocument(await get("/api/v1/documents", { path: target.file }));
      const [structure, version, recents] = await Promise.all([
        opened === null ? null : get(`${documentApi(opened)}/structure`),
        opened === null ? null : get(`/api/v1/documents/${encodeURIComponent(opened.id)}/version`),
        get("/api/v1/documents"),
      ]);
      return { structure, version, recents };
    };
    void sharedLoad(
      FACTS_IN_FLIGHT,
      [threadRef.environmentId, threadRef.threadId, key].join("\n"),
      load,
    ).then(({ structure, version, recents }) => {
      if (cancelled) return;
      const name = readDocumentName(structure);
      // A panel tab holds only the model's id: this names it, for one no folder lists.
      if (name !== null && isDocumentId(shown.path)) noteModelTitle(shown.path, name);
      setFacts({
        key,
        path: shown.path,
        kind: readDocumentKind(structure),
        name,
        materials: structure === null ? null : readMaterials(structure),
        version,
        updated: readUpdated(recents, shown.path),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, request, threadRef.environmentId, threadRef.threadId]);

  if (shown === null) return null;
  // Until this revision's facts arrive, the last revision's stand for the same file.
  const current = facts !== null && facts.path === shown.path ? facts : null;
  return {
    pluginId: shown.pluginId,
    part: {
      path: shown.path,
      ...describePart(shown.path, current?.kind ?? null, current?.name ?? null, root),
      materials: current?.materials ?? null,
      build: partBuild(
        live !== null && live.id === shown.path ? live.reply : null,
        current,
        isDocumentId(shown.path),
      ),
    },
  };
}
