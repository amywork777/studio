/**
 * StudioSamples - the finished sample projects Studio ships. A samples folder
 * (`T3CODE_SAMPLES_DIR`) holds one folder per sample, each with a
 * `studio-sample.json` that names it, says what it is, how it is made and from
 * what, and what it shows, and points at its card picture and the file a copy
 * opens on. The server lists them in `ServerConfig.samples`.
 *
 * @module StudioSamples
 */
import { StudioSample } from "@t3tools/contracts";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const SAMPLE_FILE = "studio-sample.json";

/** The file as people write it: the sample's id is its `sample` field. */
const StudioSampleFile = Schema.Struct({
  sample: StudioSample.fields.id,
  version: Schema.Number,
  name: StudioSample.fields.name,
  purpose: StudioSample.fields.purpose,
  process: StudioSample.fields.process,
  material: StudioSample.fields.material,
  shows: StudioSample.fields.shows,
  picture: StudioSample.fields.picture,
  open: StudioSample.fields.open,
});

const decodeSampleFile = Schema.decodeEffect(fromLenientJson(StudioSampleFile));

/**
 * Every sample in `dir`, by name. A folder with no `studio-sample.json`, or
 * whose file is not a sample, is left out with a warning, and the rest are
 * listed. A missing `dir` has none.
 */
export const readSamples = Effect.fn("StudioSamples.readSamples")(function* (dir: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folders = yield* fileSystem.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
  const found = yield* Effect.forEach(folders, (folder) =>
    Effect.gen(function* () {
      const root = path.join(dir, folder);
      const text = yield* fileSystem.readFileString(path.join(root, SAMPLE_FILE));
      const file = yield* decodeSampleFile(text);
      return {
        id: file.sample,
        name: file.name,
        purpose: file.purpose,
        ...(file.process === undefined ? {} : { process: file.process }),
        ...(file.material === undefined ? {} : { material: file.material }),
        shows: file.shows,
        picture: file.picture,
        open: file.open,
        path: path.resolve(root),
      } satisfies StudioSample;
    }).pipe(
      Effect.map((sample): StudioSample | null => sample),
      Effect.catch(() =>
        Effect.logWarning("Skipping a sample folder with no valid studio-sample.json", {
          folder,
        }).pipe(Effect.as(null)),
      ),
    ),
  );
  return found
    .filter((sample): sample is StudioSample => sample !== null)
    .toSorted((a, b) => a.name.localeCompare(b.name));
});
