import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpServer from "effect/http/HttpServer";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";

import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import { getInstallId } from "./Identify.ts";
import * as AnalyticsService from "./AnalyticsService.ts";

interface SentEvent {
  readonly id?: string;
  readonly event?: string;
  readonly properties?: { readonly index?: number };
}

interface RecordedRequest {
  readonly path: string;
  readonly body: {
    readonly schema?: number;
    readonly install?: string;
    readonly version?: string;
    readonly platform?: string;
    readonly arch?: string;
    readonly mode?: string;
    readonly events?: ReadonlyArray<SentEvent>;
  } | null;
}

const SentBatch = Schema.fromJsonString(
  Schema.Struct({
    events: Schema.Array(Schema.Struct({ id: Schema.String })),
  }),
);
const decodeSentBatch = Schema.decodeEffect(SentBatch);

/**
 * HTTP client that reads each batch, then fails as if the connection dropped
 * before the response arrived. The receiver stores these batches, so the server
 * must not send them forever.
 */
const layerAcceptThenFailClient = (batches: Array<ReadonlyArray<{ readonly id: string }>>) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.gen(function* () {
        if (request.body._tag === "Uint8Array") {
          const body = yield* decodeSentBatch(new TextDecoder().decode(request.body.body)).pipe(
            Effect.orDie,
          );
          batches.push(body.events);
        }
        return yield* new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request, cause: "connection reset" }),
        });
      }),
    ),
  );

/** A receiver that answers every request and keeps its path. */
const receiver = (paths: Array<string>) =>
  Layer.launch(
    HttpServer.serve(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        // The test client puts the receiver's address in front of the route.
        paths.push(request.url.replace(/^.*(?=\/v1\/)/u, ""));
        return HttpServerResponse.empty({ status: 204 });
      }),
    ),
  ).pipe(Effect.forkScoped);

/**
 * Everything the service needs but itself, with settings that may change once (`changesTo`) as the
 * service starts.
 */
const receiverRuntime = (
  shared: { readonly shareUsageData: boolean; readonly usageDataAnswered: boolean },
  changesTo?: { readonly shareUsageData: boolean; readonly usageDataAnswered?: boolean },
) => {
  const layerSettings = ServerSettings.layerTest(shared);
  const layerChangingSettings =
    changesTo === undefined
      ? layerSettings
      : Layer.effect(
          ServerSettings.ServerSettingsService,
          Effect.gen(function* () {
            const base = yield* ServerSettings.ServerSettingsService;
            return {
              ...base,
              streamChanges: Stream.make({ ...DEFAULT_SERVER_SETTINGS, ...shared, ...changesTo }),
            };
          }),
        ).pipe(Layer.provide(layerSettings));
  return Layer.mergeAll(
    layerChangingSettings,
    ServerConfig.ServerConfig.layerTest(process.cwd(), { prefix: "t3-telemetry-forget-" }),
    ConfigProvider.layer(ConfigProvider.fromUnknown({ T3CODE_USAGE_URL: "http://localhost" })),
    Layer.succeed(HostProcess.Platform, "linux"),
    Layer.succeed(HostProcess.Architecture, "arm64"),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));
};

const forgetOwedPath = Effect.gen(function* () {
  const { anonymousIdPath } = yield* ServerConfig.ServerConfig;
  const path = yield* Path.Path;
  return path.join(path.dirname(anonymousIdPath), "usage-forget-owed");
});

it("retryDelayMs doubles from 2s and stays under the 5 minute cap", () => {
  assert.equal(AnalyticsService.retryDelayMs(1, 0), 1_000);
  assert.equal(AnalyticsService.retryDelayMs(2, 0.999_999), 4_000);
  assert.equal(AnalyticsService.retryDelayMs(30, 0), 150_000);
  assert.equal(AnalyticsService.retryDelayMs(30, 0.999_999), 300_000);
});

it.layer(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer))("AnalyticsService test", (it) => {
  it.effect("a batch that keeps failing is retried with backoff, then dropped", () =>
    Effect.gen(function* () {
      const batches: Array<ReadonlyArray<{ readonly id: string }>> = [];
      const layerRuntime = AnalyticsService.layer.pipe(
        Layer.provideMerge(
          ServerConfig.ServerConfig.layerTest(process.cwd(), { prefix: "t3-telemetry-retry-" }),
        ),
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              T3CODE_USAGE_URL: "http://localhost",
            }),
          ),
        ),
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(HostProcess.Platform, "win32"),
            Layer.succeed(HostProcess.Architecture, "x64"),
            layerAcceptThenFailClient(batches),
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const analytics = yield* AnalyticsService.AnalyticsService;
        for (let index = 0; index < 20; index += 1) {
          yield* analytics.record("test.retry", { index });
        }
        // Before the fix this loop sent the batch about once a second.
        for (let second = 0; second < 600; second += 1) {
          yield* TestClock.adjust("1 second");
        }
      }).pipe(Effect.provide(layerRuntime));

      assert.equal(batches.length, 5);
      const ids = batches.map((batch) => batch.map((event) => event.id).join(","));
      assert.equal(new Set(ids).size, 1, "every retry carries the same ids");
      assert.equal(new Set(batches[0]?.map((event) => event.id)).size, 20);
    }),
  );

  it.effect("flush drains all buffered events across multiple batches", () =>
    Effect.gen(function* () {
      let install: string | null = null;
      const capturedRequests: Array<RecordedRequest> = [];
      const layerServerConfig = ServerConfig.ServerConfig.layerTest(process.cwd(), {
        prefix: "t3-telemetry-base-",
      });

      const layerTelemetry = AnalyticsService.layer.pipe(Layer.provideMerge(layerServerConfig));
      const layerConfig = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          T3CODE_USAGE_URL: "http://localhost",
          T3CODE_TELEMETRY_FLUSH_BATCH_SIZE: 20,
          T3CODE_APP_VERSION: "0.2.0",
        }),
      );
      const layerBatchServer = HttpServer.serve(
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          if (request.method !== "POST") {
            return HttpServerResponse.empty({ status: 404 });
          }

          const payload = yield* request.json.pipe(
            Effect.map((body) => body as RecordedRequest["body"]),
            Effect.orElseSucceed(() => null),
          );

          capturedRequests.push({ path: request.url, body: payload });

          return HttpServerResponse.jsonUnsafe({});
        }),
      );
      const layerRuntime = layerTelemetry.pipe(
        Layer.provide(layerConfig),
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(HostProcess.Platform, "linux"),
            Layer.succeed(HostProcess.Architecture, "arm64"),
          ),
        ),
        Layer.provideMerge(NodeHttpServer.layerTest),
      );

      yield* Effect.gen(function* () {
        yield* Layer.launch(layerBatchServer).pipe(Effect.forkScoped);
        install = yield* getInstallId;
        assert.equal(install !== null, true);
        const analytics = yield* AnalyticsService.AnalyticsService;

        for (let index = 0; index < 45; index += 1) {
          yield* analytics.record("test.flush.drain", { index });
        }

        yield* analytics.flush;
      }).pipe(Effect.provide(layerRuntime));

      const batchRequests = capturedRequests.filter((request) =>
        Array.isArray(request.body?.events),
      );
      assert.equal(batchRequests.length, 3);
      assert.isTrue(batchRequests.every((request) => request.path.endsWith("/v1/events")));
      const deliveredIndexes = batchRequests.flatMap((request) =>
        (request.body?.events ?? [])
          .filter((event) => event.event === "test.flush.drain")
          .map((event) => event.properties?.index)
          .filter((index): index is number => typeof index === "number"),
      );
      assert.deepEqual(
        deliveredIndexes.toSorted((a, b) => a - b),
        Array.from({ length: 45 }, (_, index) => index),
      );
      // Each batch says who sends it, by the install's random id, beside the counts.
      for (const request of batchRequests) {
        const { schema, install: sentInstall, version, platform, arch, mode } = request.body ?? {};
        assert.deepEqual(
          { schema, install: sentInstall, version, platform, arch, mode },
          {
            schema: 1,
            install: install ?? undefined,
            version: "0.2.0",
            platform: "linux",
            arch: "arm64",
            mode: "web",
          },
        );
      }
    }),
  );

  it.effect.each([
    [{}, true],
    [{ DO_NOT_TRACK: "1" }, false],
    [{ DO_NOT_TRACK: "true" }, false],
    [{ DO_NOT_TRACK: "0" }, true],
    [{ CI: "true" }, false],
    [{ CI: "false" }, true],
  ] as const)("sends nothing where the machine opts out: %j", ([env, available]) =>
    Effect.gen(function* () {
      const shown = yield* AnalyticsService.usageDataAvailable.pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              T3CODE_USAGE_URL: "https://usage.example",
              ...env,
            }),
          ),
        ),
      );
      assert.strictEqual(shown, available);
    }),
  );

  it.effect("does not send batch requests when telemetry is disabled", () =>
    Effect.gen(function* () {
      const capturedPaths: Array<string> = [];
      const layerServerConfig = ServerConfig.ServerConfig.layerTest(process.cwd(), {
        prefix: "t3-telemetry-disabled-",
      });
      const layerTelemetry = AnalyticsService.layer.pipe(Layer.provideMerge(layerServerConfig));
      const layerConfig = ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          T3CODE_TELEMETRY_ENABLED: false,
          T3CODE_USAGE_URL: "http://localhost",
        }),
      );
      const layerBatchServer = HttpServer.serve(
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          capturedPaths.push(request.url);
          return HttpServerResponse.jsonUnsafe({});
        }),
      );
      const layerRuntime = layerTelemetry.pipe(
        Layer.provide(layerConfig),
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(HostProcess.Platform, "linux"),
            Layer.succeed(HostProcess.Architecture, "arm64"),
          ),
        ),
        Layer.provideMerge(NodeHttpServer.layerTest),
      );

      yield* Effect.gen(function* () {
        yield* Layer.launch(layerBatchServer).pipe(Effect.forkScoped);
        const analytics = yield* AnalyticsService.AnalyticsService;
        yield* analytics.record("test.disabled", { index: 1 });
        yield* analytics.flush;
      }).pipe(Effect.provide(layerRuntime));

      assert.deepEqual(capturedPaths, []);
    }),
  );

  it.effect.each([true, false])("sends events only while usage data is shared (%s)", (shared) =>
    Effect.gen(function* () {
      const sent: Array<string> = [];
      const layerTelemetry = AnalyticsService.layer.pipe(
        Layer.provide(
          ServerSettings.layerTest({ shareUsageData: shared, usageDataAnswered: true }),
        ),
        Layer.provideMerge(
          ServerConfig.ServerConfig.layerTest(process.cwd(), { prefix: "t3-telemetry-shared-" }),
        ),
      );
      const layerRuntime = layerTelemetry.pipe(
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              T3CODE_USAGE_URL: "http://localhost",
            }),
          ),
        ),
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(HostProcess.Platform, "linux"),
            Layer.succeed(HostProcess.Architecture, "arm64"),
          ),
        ),
        Layer.provideMerge(NodeHttpServer.layerTest),
      );
      const layerBatchServer = HttpServer.serve(
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          sent.push(request.url);
          return HttpServerResponse.jsonUnsafe({});
        }),
      );

      yield* Effect.gen(function* () {
        yield* Layer.launch(layerBatchServer).pipe(Effect.forkScoped);
        const analytics = yield* AnalyticsService.AnalyticsService;
        yield* analytics.record("test.shared", { index: 1 });
        yield* analytics.flush;
      }).pipe(Effect.provide(layerRuntime));

      assert.equal(sent.length, shared ? 1 : 0);
    }),
  );
  it.effect("sends nothing until the first-launch question is answered", () =>
    Effect.gen(function* () {
      const paths: Array<string> = [];
      yield* Effect.gen(function* () {
        yield* receiver(paths);
        yield* Effect.gen(function* () {
          const analytics = yield* AnalyticsService.AnalyticsService;
          yield* analytics.record("test.untold", { index: 1 });
          yield* analytics.flush;
        }).pipe(Effect.provide(AnalyticsService.layer));
      }).pipe(Effect.provide(receiverRuntime({ shareUsageData: true, usageDataAnswered: false })));
      assert.deepEqual(paths, []);
    }),
  );

  it.effect("turning sharing off asks the receiver to forget before anything more goes out", () =>
    Effect.gen(function* () {
      const paths: Array<string> = [];
      const owed = yield* Effect.gen(function* () {
        yield* receiver(paths);
        const markerPath = yield* forgetOwedPath;
        yield* Effect.gen(function* () {
          const analytics = yield* AnalyticsService.AnalyticsService;
          // The change reaches the service as it starts.
          for (let turn = 0; turn < 5; turn += 1) yield* Effect.yieldNow;
          yield* analytics.record("test.after", { index: 1 });
          yield* analytics.flush;
          assert.deepEqual(paths, [], "nothing goes out while a deletion is owed");
        }).pipe(Effect.provide(AnalyticsService.layer));
        return yield* (yield* FileSystem.FileSystem).exists(markerPath);
      }).pipe(
        Effect.provide(
          receiverRuntime(
            { shareUsageData: true, usageDataAnswered: true },
            { shareUsageData: false },
          ),
        ),
      );
      assert.deepEqual(paths, ["/v1/forget", "/v1/events"]);
      assert.isFalse(owed, "a deletion the receiver took is owed no more");
    }),
  );

  it.effect("a no before any yes contacts nobody", () =>
    Effect.gen(function* () {
      const paths: Array<string> = [];
      yield* Effect.gen(function* () {
        yield* receiver(paths);
        yield* Effect.gen(function* () {
          yield* AnalyticsService.AnalyticsService;
          for (let turn = 0; turn < 5; turn += 1) yield* Effect.yieldNow;
        }).pipe(Effect.provide(AnalyticsService.layer));
      }).pipe(
        Effect.provide(
          receiverRuntime(
            { shareUsageData: true, usageDataAnswered: false },
            { shareUsageData: false, usageDataAnswered: true },
          ),
        ),
      );
      assert.deepEqual(paths, []);
    }),
  );

  it.effect("a deletion owed before a restart is asked for again", () =>
    Effect.gen(function* () {
      const paths: Array<string> = [];
      yield* Effect.gen(function* () {
        yield* receiver(paths);
        const fileSystem = yield* FileSystem.FileSystem;
        const markerPath = yield* forgetOwedPath;
        yield* fileSystem.writeFileString(markerPath, "owed");
        yield* Effect.gen(function* () {
          const analytics = yield* AnalyticsService.AnalyticsService;
          yield* analytics.record("test.owed", { index: 1 });
          yield* analytics.flush;
        }).pipe(Effect.provide(AnalyticsService.layer));
        assert.isFalse(yield* fileSystem.exists(markerPath));
      }).pipe(Effect.provide(receiverRuntime({ shareUsageData: true, usageDataAnswered: true })));
      assert.deepEqual(paths, ["/v1/forget", "/v1/events"]);
    }),
  );
});
