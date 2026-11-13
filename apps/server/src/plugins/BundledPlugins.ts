/**
 * Plugins an app built on T3 Code ships with: `T3CODE_PLUGIN_MARKETPLACE` folders (PATH-separated)
 * and `T3CODE_DEFAULT_PLUGINS` names, installed and enabled on first start. Each default is offered
 * once (`offered.json`), so an uninstall sticks; one still installed is updated when its folder
 * changed (`bundled.json`). Without the variables nothing changes.
 */
import { catalogKey } from "@t3tools/plugins";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as PluginFiles from "./pluginFiles.ts";
import * as PluginService from "./PluginService.ts";
import * as PluginStore from "./PluginStore.ts";

/** The marketplace folders, split as PATH is on this platform. */
const marketplaceFolders = Effect.gen(function* () {
  const value = yield* Config.String("T3CODE_PLUGIN_MARKETPLACE").pipe(Config.withDefault(""));
  const separator = (yield* HostProcess.isWindows) ? ";" : ":";
  return value
    .split(separator)
    .map((folder) => folder.trim())
    .filter((folder) => folder.length > 0);
});

const defaultPluginNames = Config.String("T3CODE_DEFAULT_PLUGINS").pipe(
  Config.map((value) =>
    value
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  ),
  Config.withDefault<ReadonlyArray<string>>([]),
);

/** The plugins a folder's marketplace lists, each with its folder inside it. */
function listedPlugins(
  folder: string,
): ReadonlyArray<{ readonly name: string; readonly source: string }> {
  const raw = PluginFiles.readJsonFile(`${folder}/.claude-plugin/marketplace.json`);
  const plugins =
    typeof raw === "object" && raw !== null && "plugins" in raw && Array.isArray(raw.plugins)
      ? raw.plugins
      : [];
  return plugins.flatMap((plugin: unknown) =>
    typeof plugin === "object" &&
    plugin !== null &&
    "name" in plugin &&
    typeof plugin.name === "string"
      ? [
          {
            name: plugin.name,
            source: "source" in plugin && typeof plugin.source === "string" ? plugin.source : "./",
          },
        ]
      : [],
  );
}

const listedNames = (folder: string) => listedPlugins(folder).map((plugin) => plugin.name);

/**
 * The installed defaults to update: those whose folder's fingerprint is not the one recorded at
 * the last start, leaving out any installed in this start, whose listing is already fresh.
 */
export function staleDefaults(
  prints: Readonly<Record<string, string>>,
  seen: Readonly<Record<string, string>>,
  installedNow: ReadonlySet<string>,
): ReadonlyArray<string> {
  return Object.entries(prints)
    .filter(([key, print]) => !installedNow.has(key) && seen[key] !== print)
    .map(([key]) => key);
}

/**
 * The defaults to list again at a start: installed, on, and with a server whose last start failed
 * (its engine still held by an older copy of the app, say), so one bad start never leaves the app
 * without the tools it ships.
 */
export function failedDefaults(
  installed: ReadonlyArray<{
    readonly id: string;
    readonly enabled: boolean;
    readonly servers: ReadonlyArray<{ readonly state: string }>;
  }>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return installed
    .filter(
      (plugin) =>
        names.includes(plugin.id) &&
        plugin.enabled &&
        plugin.servers.some((server) => server.state === "error"),
    )
    .map((plugin) => plugin.id);
}

/**
 * The catalog keys of the plugins to offer: each name from the first folder
 * that lists it, else from the first folder (where installing it fails, and is
 * tried again at the next start).
 */
export function defaultPluginKeys(
  folders: ReadonlyArray<string>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return names.flatMap((name) => {
    const folder = folders.find((entry) => listedNames(entry).includes(name)) ?? folders[0];
    return folder === undefined ? [] : [catalogKey(PluginStore.folderMarketplaceId(folder), name)];
  });
}

/** The plugin store over the default catalogs plus the bundled folders. */
export const storeLayer = Layer.unwrap(
  Effect.gen(function* () {
    const folders = yield* marketplaceFolders;
    return PluginStore.layerWith([
      ...PluginStore.DEFAULT_MARKETPLACE_SOURCES,
      ...folders.map((path) => ({ type: "folder" as const, path })),
    ]);
  }),
);

const readOffered = (file: string): Array<string> => {
  const raw = PluginFiles.readJsonFile(file);
  return Array.isArray(raw) ? raw.filter((key): key is string => typeof key === "string") : [];
};

/** Installs and enables each default plugin the user was not offered before. */
export const offerDefaults = Effect.gen(function* () {
  const folders = yield* marketplaceFolders;
  const names = yield* defaultPluginNames;
  if (folders.length === 0 || names.length === 0) return;
  const plugins = yield* PluginService.PluginService;
  const config = yield* ServerConfig.ServerConfig;
  const path = yield* Path.Path;
  const offeredFile = path.join(config.stateDir, "plugins", "offered.json");
  const current = defaultPluginKeys(folders, names);
  // A default the app no longer ships is removed (its folder may be gone), and offered again
  // should the app ship it again.
  const withdrawn = readOffered(offeredFile).filter((key) => !current.includes(key));
  if (withdrawn.length > 0) {
    const { plugins: installed } = yield* plugins.list;
    for (const key of withdrawn) {
      // A plugin's id is its name, the key's last part: T3 installs one plugin of a name.
      const plugin = installed.find((entry) => entry.id === key.slice(key.lastIndexOf("/") + 1));
      yield* (plugin === undefined ? Effect.void : plugins.uninstall(plugin.id)).pipe(
        Effect.andThen(
          Effect.sync(() =>
            PluginFiles.writeJsonFile(
              offeredFile,
              readOffered(offeredFile).filter((each) => each !== key),
            ),
          ),
        ),
        Effect.catch((error) =>
          Effect.logWarning("bundled plugin was not removed", { key, error: error.message }),
        ),
      );
    }
  }
  const installedNow = new Set<string>();
  for (const key of current) {
    if (readOffered(offeredFile).includes(key)) continue;
    // Recorded only once installed: a failure (an unreadable checkout, a clash with the same
    // plugin from another catalog) is tried again at the next start.
    yield* plugins.install(key).pipe(
      Effect.tap((installed) =>
        installed.enabled ? Effect.void : plugins.setEnabled(installed.id, true),
      ),
      Effect.tap(() =>
        Effect.sync(() => {
          installedNow.add(key);
          PluginFiles.writeJsonFile(offeredFile, [...readOffered(offeredFile), key]);
        }),
      ),
      Effect.catch((error) =>
        Effect.logWarning("bundled plugin was not installed", { key, error: error.message }),
      ),
    );
  }

  // Each offered default's folder as it is now, keyed like the offers.
  const offered = new Set(readOffered(offeredFile));
  const located = new Map<string, { readonly name: string }>();
  const prints: Record<string, string> = {};
  for (const folder of folders) {
    const market = PluginStore.folderMarketplaceId(folder);
    for (const plugin of listedPlugins(folder)) {
      const key = catalogKey(market, plugin.name);
      if (!names.includes(plugin.name) || !offered.has(key) || located.has(key)) continue;
      located.set(key, { name: plugin.name });
      prints[key] = PluginFiles.fingerprintHash(path.join(folder, plugin.source));
    }
  }
  const seenFile = path.join(config.stateDir, "plugins", "bundled.json");
  const raw = PluginFiles.readJsonFile(seenFile);
  const seen: Record<string, string> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? Object.fromEntries(
          Object.entries(raw).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : {};
  const stale = staleDefaults(prints, seen, installedNow);
  if (stale.length > 0) {
    const { plugins: installed } = yield* plugins.list;
    for (const key of stale) {
      // A plugin's id is its name: T3 installs one plugin of a name, from one catalog.
      const plugin = installed.find((entry) => entry.id === located.get(key)?.name);
      if (plugin === undefined) continue;
      yield* plugins
        .update(plugin.id)
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning("bundled plugin was not updated", { key, error: error.message }),
          ),
        );
    }
  }
  PluginFiles.writeJsonFile(seenFile, prints);

  // A default whose servers failed when they last started is listed again, by turning it on.
  const { plugins: listed } = yield* plugins.list;
  for (const id of failedDefaults(listed, names)) {
    yield* plugins
      .setEnabled(id, true)
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("bundled plugin was not listed again", { id, error: error.message }),
        ),
      );
  }
});

/** Offers the defaults in the background, so startup never waits on a plugin's first listing. */
export const layer = Layer.effectDiscard(Effect.forkScoped(offerDefaults));
