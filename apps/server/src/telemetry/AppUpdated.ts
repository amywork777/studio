/**
 * Counts an update (`studio.updated`, the version moved from and to): at launch, the app's version beside
 * the one that ran last (`last-app-version`, next to the install id). A first launch has none to compare,
 * and counts nothing; a version that is no release's number (a build from source) is never sent.
 *
 * @module AppUpdated
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { appVersion } from "../appVersion.ts";
import * as ServerConfig from "../config.ts";
import * as AnalyticsService from "./AnalyticsService.ts";

const RELEASE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[a-z0-9.]{1,20})?$/u;

/** The update a launch makes, or null when it is no update. */
export function updateOf(
  previous: string | null,
  current: string,
): { readonly from: string; readonly to: string } | null {
  const from = previous?.trim() ?? "";
  if (from === "" || from === current || !RELEASE.test(from) || !RELEASE.test(current)) return null;
  return { from, to: current };
}

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const analytics = yield* AnalyticsService.AnalyticsService;
    const config = yield* ServerConfig.ServerConfig;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const current = yield* appVersion;
    const file = path.join(path.dirname(config.anonymousIdPath), "last-app-version");
    const previous = yield* fileSystem.readFileString(file).pipe(Effect.orElseSucceed(() => null));
    const update = updateOf(previous, current);
    if (update !== null) yield* analytics.record("studio.updated", { ...update });
    if (previous?.trim() !== current) {
      yield* fileSystem.writeFileString(file, `${current}\n`).pipe(Effect.ignore);
    }
  }).pipe(Effect.ignoreCause),
);
