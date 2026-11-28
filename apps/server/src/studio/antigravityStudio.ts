// How Studio's plugins reach an Antigravity session, called from `AntigravityDriver.ts` with one line.
import type * as PluginStore from "../plugins/PluginStore.ts";
import { PluginStore as PluginStoreService } from "../plugins/PluginStore.ts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";

const MANIFEST = "plugin.json";

/**
 * The manifest agy reads for one plugin: its name and its skills folder as an absolute path. It has
 * no `$schema` because agy ignores `skills` in a manifest whose `$schema` is an Agent Plugins one.
 */
export const pluginManifest = (id: string, skillsDir: string) =>
  `${JSON.stringify({ name: id, skills: [skillsDir] }, null, 2)}\n`;

/**
 * Leaves one folder in `<profile>/config/plugins` for each enabled plugin that has skills, as agy
 * loads each of them at session start, and takes back the manifest of a plugin no longer enabled.
 * A plugin's MCP servers are not handed over: agents reach them through T3's own MCP server.
 */
export const syncPluginSkills = Effect.fn("AntigravityStudio.syncPluginSkills")(function* (
  profileDirectory: string,
  plugins: ReadonlyArray<PluginStore.EnabledPlugin>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = path.join(profileDirectory, "config", "plugins");
  const wanted = new Map(
    plugins.flatMap((plugin) =>
      plugin.skillsDir === null ? [] : [[plugin.id, pluginManifest(plugin.id, plugin.skillsDir)]],
    ),
  );
  const present = (yield* fs.exists(folder)) ? yield* fs.readDirectory(folder) : [];
  for (const name of present.filter((entry) => !wanted.has(entry))) {
    const directory = path.join(folder, name);
    yield* fs.remove(path.join(directory, MANIFEST), { force: true });
    // Anything else in the folder is not Studio's, and keeps it; `remove` takes a folder only with
    // `recursive`, which is safe on one just found empty.
    if ((yield* fs.readDirectory(directory)).length === 0) {
      yield* fs.remove(directory, { recursive: true });
    }
  }
  for (const [id, manifest] of wanted) {
    const file = path.join(folder, id, MANIFEST);
    if (Option.contains(yield* fs.readFileString(file).pipe(Effect.option), manifest)) continue;
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, manifest);
  }
});

/**
 * Keeps an Antigravity instance's profile in step with the enabled plugins for the instance's life;
 * a failure leaves the plugins' skills out of the sessions and says so in the log.
 */
export const followPluginSkills = Effect.fn("AntigravityStudio.followPluginSkills")(function* (
  profileDirectory: string,
) {
  const store = yield* Effect.serviceOption(PluginStoreService);
  if (Option.isNone(store)) return;
  const sync = store.value.enabledPlugins.pipe(
    Effect.flatMap((plugins) => syncPluginSkills(profileDirectory, plugins)),
    Effect.catchCause((cause) =>
      Effect.logWarning("Antigravity sessions are not handed the plugins' skills.", { cause }),
    ),
  );
  yield* sync;
  yield* store.value.changes.pipe(
    Stream.runForEach(() => sync),
    Effect.forkScoped,
  );
});
