import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { readSamples } from "./StudioSamples.ts";

const sampleFile = (id: string, name: string) =>
  JSON.stringify({
    sample: id,
    version: 1,
    name,
    purpose: `A ${name}.`,
    shows: ["CNC"],
    picture: "pictures/a.png",
    open: "parts/a.step",
  });

it.effect("lists the good samples by name and skips a bad folder", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-samples-" });
    const write = (folder: string, contents: string) =>
      fileSystem
        .makeDirectory(path.join(dir, folder), { recursive: true })
        .pipe(
          Effect.andThen(
            fileSystem.writeFileString(path.join(dir, folder, "studio-sample.json"), contents),
          ),
        );
    yield* write("zebra", sampleFile("zebra", "Zebra stand"));
    yield* write("apple", sampleFile("apple", "Apple holder"));
    yield* write("broken", '{ "sample": "broken" }');
    yield* fileSystem.makeDirectory(path.join(dir, "no-json"));

    const samples = yield* readSamples(dir);

    assert.deepStrictEqual(
      samples.map((sample) => sample.id),
      ["apple", "zebra"],
    );
    assert.strictEqual(samples[0]?.path, path.resolve(dir, "apple"));
    assert.strictEqual(samples[0]?.open, "parts/a.step");
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("has no samples while the folder is missing", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const dir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-samples-" });
    const path = yield* Path.Path;
    assert.deepStrictEqual(yield* readSamples(path.join(dir, "missing")), []);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("carries a sample's process and material, and leaves them out when it names none", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-samples-" });
    const write = (folder: string, contents: string) =>
      fileSystem
        .makeDirectory(path.join(dir, folder), { recursive: true })
        .pipe(
          Effect.andThen(
            fileSystem.writeFileString(path.join(dir, folder, "studio-sample.json"), contents),
          ),
        );
    yield* write(
      "made",
      JSON.stringify({
        ...JSON.parse(sampleFile("made", "Made plate")),
        process: "CNC machining",
        material: "Aluminium 6061-T6",
      }),
    );
    yield* write("plain", sampleFile("plain", "Plain plate"));

    const samples = yield* readSamples(dir);

    const made = samples.find((sample) => sample.id === "made");
    assert.strictEqual(made?.process, "CNC machining");
    assert.strictEqual(made?.material, "Aluminium 6061-T6");
    const plain = samples.find((sample) => sample.id === "plain");
    assert.strictEqual(plain !== undefined && "process" in plain, false);
    assert.strictEqual(plain !== undefined && "material" in plain, false);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("lists every example Studio ships, each with its files in place", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.resolve(import.meta.dirname, "..", "..", "..", "..", "studio-sample");

    const samples = yield* readSamples(dir);

    assert.deepStrictEqual(samples.map((sample) => sample.id).toSorted(), [
      "desk-lamp",
      "motor-mount",
      "phone-stand",
      "servo-bracket",
      "shelf-bracket",
    ]);
    for (const sample of samples) {
      // Each opens on a model's script (a copy builds it and opens its document), which is there.
      assert.isTrue(sample.open.endsWith(".py"), sample.id);
      assert.isTrue(yield* fileSystem.exists(path.join(sample.path, sample.open)), sample.id);
      assert.isTrue(yield* fileSystem.exists(path.join(sample.path, sample.picture)), sample.id);
      assert.isTrue(yield* fileSystem.exists(path.join(sample.path, "README.md")), sample.id);
      assert.isTrue((sample.process ?? "") !== "" && (sample.material ?? "") !== "", sample.id);
      assert.isTrue(sample.shows.length > 0, sample.id);
      // A part's material is in its script, so the part tree names the one the Overview does.
      if (sample.open.startsWith("parts/")) {
        const script = yield* fileSystem.readFileString(path.join(sample.path, sample.open));
        assert.match(script, /\.material = /, sample.id);
      }
    }
    // The CNC part carries its requirements on the model: the example 3D PMI's library entry opens.
    assert.include(samples.find((sample) => sample.id === "motor-mount")?.shows ?? [], "3D PMI");
  }).pipe(Effect.provide(NodeServices.layer)),
);
