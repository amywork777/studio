import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { onReturn } from "~/hooks/useRefreshOnReturn";
import { humanName } from "./partNames";
import { type ProjectModel, readFolderModels } from "./projectModels";
import { type CadGet, useEnvironmentCadGet } from "./useVersions";

/**
 * Shared by every list that shows a folder. When the revision moves (`modelsChanged`, `modelShown`)
 * every folder on screen is read again in ONE request per environment
 * (`GET /api/v1/local/models?root=A&root=B...`), and each keeps its models until it lands.
 */
export function folderModelsStore(
  schedule: (flush: () => void) => void = queueMicrotask,
  // A first read that failed (the CAD service not answering yet) is asked again later, after
  // 1, 2, 4, 8 and 16 seconds, before the folder counts as read and empty.
  later: (again: () => void, attempt: number) => void = (again, attempt) =>
    void setTimeout(again, 1000 * 2 ** (attempt - 1)),
) {
  let revision = 0;
  let version = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };
  /** Each folder's last read, by environment and folder: its models, and the revision read at. */
  const read = new Map<
    string,
    { readonly at: number; readonly models: ReadonlyArray<ProjectModel> }
  >();
  /** The folders waiting to be asked, by environment, with the revision and the read to ask with. */
  const waiting = new Map<string, { at: number; get: CadGet; roots: Set<string> }>();
  /** The folders asked at a revision and not answered yet, by environment and folder. */
  const asked = new Map<string, number>();
  /** How many first reads of a folder have failed, by environment and folder. */
  const failed = new Map<string, number>();
  /** What the viewer calls a model no folder has listed (`noteModelTitle`), by its id. */
  const heard = new Map<string, string>();
  /** The build each model was last on screen at (`shown`), by its id. */
  const builds = new Map<string, string>();
  const keyOf = (environmentId: EnvironmentId, root: string) => `${environmentId}\n${root}`;
  const models = (environmentId: EnvironmentId, root: string): ReadonlyArray<ProjectModel> =>
    read.get(keyOf(environmentId, root))?.models ?? EMPTY;
  /** Each list's last snapshot, by environment and folders, with the version it was made at. */
  const snapshots = new Map<
    string,
    {
      readonly version: number;
      readonly value: ReadonlyMap<string, ReadonlyArray<ProjectModel>>;
    }
  >();
  let titles: { readonly version: number; readonly value: ReadonlyMap<string, string> } = {
    version: -1,
    value: new Map(),
  };

  const flush = (environmentId: EnvironmentId) => {
    const batch = waiting.get(environmentId);
    waiting.delete(environmentId);
    if (batch === undefined || batch.roots.size === 0) return;
    const roots = [...batch.roots];
    const query = roots.map((root) => `root=${encodeURIComponent(root)}`).join("&");
    void batch.get(`/api/v1/local/models?${query}`).then((reply) => {
      const answered =
        typeof reply === "object" && reply !== null && "roots" in reply ? reply.roots : null;
      for (const root of roots) {
        const key = keyOf(environmentId, root);
        if (asked.get(key) === batch.at) asked.delete(key);
        const held = read.get(key);
        // An answer older than one already read changes nothing.
        if (held !== undefined && held.at > batch.at) continue;
        const models =
          typeof answered === "object" && answered !== null && root in answered
            ? readFolderModels({ models: (answered as Record<string, unknown>)[root] })
            : null;
        // A failed read keeps what was known; a first one that failed is asked again, and is
        // empty at this revision once it has failed RETRIES times.
        if (models === null && held === undefined) {
          const attempt = (failed.get(key) ?? 0) + 1;
          failed.set(key, attempt);
          if (attempt <= RETRIES) {
            later(notify, attempt);
            continue;
          }
        }
        if (models !== null) failed.delete(key);
        read.set(key, { at: batch.at, models: models ?? held?.models ?? EMPTY });
      }
      notify();
    });
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Moves whenever any folder's models or the revision do: what a hook re-renders on. */
    version: () => version,
    revision: () => revision,
    /** A project's models may have changed (an agent's turn wrote its files, a part was built). */
    changed() {
      revision += 1;
      notify();
    },
    /**
     * A view shows a model at `build`: its sync's revision, which moves each time the engine
     * builds the model again. A build not heard of yet may be one no agent's turn made (a script
     * edited outside Studio is built when its view opens), so every folder is read again. The same
     * build again, and a view that names none, say nothing new.
     */
    shown(id: string, build: string) {
      if (build === "" || builds.get(id) === build) return;
      builds.set(id, build);
      revision += 1;
      notify();
    },
    /** Whether a folder's models have been read once, a failed read included. */
    known(environmentId: EnvironmentId, root: string): boolean {
      return read.has(keyOf(environmentId, root));
    },
    /** A folder's models as last read, kept while a newer read is under way; empty before any. */
    models,
    /**
     * Each of the folders in `key` (one per line) and its models: the same Map until a read or a
     * change moves the version, as `useSyncExternalStore` needs of a snapshot.
     */
    snapshot(environmentId: EnvironmentId, key: string) {
      const id = `${environmentId}\n\n${key}`;
      const held = snapshots.get(id);
      if (held?.version === version) return held.value;
      const value: ReadonlyMap<string, ReadonlyArray<ProjectModel>> = new Map(
        (key === "" ? [] : key.split("\n")).map((root) => [root, models(environmentId, root)]),
      );
      snapshots.set(id, { version, value });
      return value;
    },
    /** Asks for the folders not read at this revision yet, with every other asked for now, in one request. */
    want(environmentId: EnvironmentId, roots: ReadonlyArray<string>, get: CadGet) {
      const at = revision;
      for (const root of roots) {
        const key = keyOf(environmentId, root);
        if ((read.get(key)?.at ?? -1) >= at || (asked.get(key) ?? -1) >= at) continue;
        asked.set(key, at);
        const batch = waiting.get(environmentId);
        if (batch === undefined) {
          waiting.set(environmentId, { at, get, roots: new Set([root]) });
          schedule(() => flush(environmentId));
        } else {
          batch.roots.add(root);
          batch.at = at;
        }
      }
    },
    /** A model's script, absolute in the folder it was read in; undefined for one not read. */
    script(id: string): string | undefined {
      for (const [key, { models }] of read) {
        const model = models.find((entry) => entry.id === id);
        if (model !== undefined)
          return `${key.slice(key.indexOf("\n") + 1).replace(/[\\/]+$/, "")}/${model.script}`;
      }
      return undefined;
    },
    /** What a model read in any folder is called, as the project lists it; undefined for one not read. */
    title(id: string): string | undefined {
      for (const { models } of read.values()) {
        const model = models.find((entry) => entry.id === id);
        if (model !== undefined) return humanName(model.name);
      }
      return heard.get(id);
    },
    /** What the viewer calls a model: its name until a folder lists it, and for one none does. */
    hear(id: string, name: string) {
      if (heard.get(id) === name) return;
      heard.set(id, name);
      notify();
    },
    /** Every model's title by its id: the same Map until a read or a change moves the version. */
    titles() {
      if (titles.version === version) return titles.value;
      const value = new Map(heard);
      for (const { models } of read.values()) {
        for (const model of models) value.set(model.id, humanName(model.name));
      }
      titles = { version, value };
      return value;
    },
  };
}

const EMPTY: ReadonlyArray<ProjectModel> = [];
/** How many times a folder's first read is asked again before it counts as read and empty. */
const RETRIES = 5;
const store = folderModelsStore();

/** A project's models may have changed (an agent's turn wrote its files, a part was built). */
export const modelsChanged = () => store.changed();

/** A view shows a model at a build (its sync's revision): a new one reads the folders again. */
export const modelShown = (id: string, build: string) => store.shown(id, build);

// Files added outside Studio (in Finder, by another app) may be models: every list reads its
// folders again when the user comes back, once for all of them however many lists are mounted.
let listening: { count: number; stop: () => void } | null = null;
const listenForReturn = () => {
  listening ??= { count: 0, stop: onReturn(window, document, modelsChanged) };
  listening.count += 1;
  return () => {
    if (listening === null || --listening.count > 0) return;
    listening.stop();
    listening = null;
  };
};

/** Whether a folder's models have been read once (`useFolderModels` re-renders when they are). */
export const folderModelsKnown = (environmentId: EnvironmentId, root: string) =>
  store.known(environmentId, root);

/** What a model read in any folder is called, as the project lists it; undefined for one not read. */
export const knownModelTitle = (id: string) => store.title(id);

/** The viewer has read what a model is called. */
export const noteModelTitle = (id: string, name: string) => store.hear(id, humanName(name));

/** Every model's title by its id: what a panel tab, which holds only the id, is called. */
export const useModelTitles = () =>
  useSyncExternalStore(store.subscribe, store.titles, store.titles);

/** A model's script, absolute, as a folder it was read in holds it; undefined for one not read. */
export const knownModelScript = (id: string) => store.script(id);

/**
 * Each of `folders`' models, by folder: empty until first read, and where the CAD service is off;
 * the last read while a newer one is under way. Pass the thread's `mutationId` where there is one:
 * an agent's change to the files reads them again, for every list.
 */
export function useProjectModels(input: {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
  readonly mutationId?: string | null | undefined;
}): ReadonlyMap<string, ReadonlyArray<ProjectModel>> {
  const { environmentId } = input;
  const get = useEnvironmentCadGet(environmentId);
  const version = useSyncExternalStore(store.subscribe, store.version);
  const key = input.folders.filter((folder) => folder !== "").join("\n");
  const mutationId = input.mutationId ?? null;
  const seen = useRef(mutationId);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- marks the shared models store changed once per new workspace mutation from the server
  useEffect(() => {
    if (mutationId === seen.current) return;
    seen.current = mutationId;
    store.changed();
  }, [mutationId]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- holds the shared window-return listener while mounted
  useEffect(listenForReturn, []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the shared models store to read these folders through the CAD service
  useEffect(() => {
    if (get === null || key === "") return;
    store.want(environmentId, key.split("\n"), get);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `version` moves with each read and change: the folders are asked for again where they need it.
  }, [get, environmentId, key, version]);
  // Read as the store's own snapshot, not a memo keyed on `version`: React Compiler drops a memo
  // dependency its body never reads, and Home's tiles then kept their first, empty read.
  return useSyncExternalStore(store.subscribe, () => store.snapshot(environmentId, key));
}

/** One folder's models (`useProjectModels`). */
export function useFolderModels(
  environmentId: EnvironmentId,
  root: string,
  mutationId?: string | null,
): ReadonlyArray<ProjectModel> {
  const folders = root === "" ? [] : [root];
  return useProjectModels({ environmentId, folders, mutationId }).get(root) ?? EMPTY;
}
