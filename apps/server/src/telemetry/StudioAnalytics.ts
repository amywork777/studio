/**
 * Studio's usage counts (law 9), provided as T3's `AnalyticsService`: events not in
 * `studioUsageEvents.json` (README's "Usage data", held equal to the receiver's list by tests) are
 * dropped, listed ones are cut to the properties they may carry, and owners are never sent.
 */
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Random from "effect/Random";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { appVersion } from "../appVersion.ts";
import * as ServerConfig from "../config.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";
import * as ServerSettings from "../serverSettings.ts";
import { AnalyticsService } from "./AnalyticsService.ts";
import usageEvents from "./studioUsageEvents.json" with { type: "json" };

type Properties = Readonly<Record<string, unknown>>;

/** Every event Studio sends, and the only properties each may carry. */
export const USAGE_EVENT_PROPERTIES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries(usageEvents).map(([event, names]) => [event, new Set(names)]),
);

/**
 * A recorded event as Studio sends it: undefined for one Studio does not list, else its properties
 * cut to those the event may carry (T3's own call sites add more than Studio sends).
 */
export function listedUsageEvent(
  event: string,
  properties: Properties | undefined,
): { readonly properties: Properties | undefined } | undefined {
  const allowed = USAGE_EVENT_PROPERTIES.get(event);
  if (allowed === undefined) return undefined;
  if (properties === undefined) return { properties };
  return {
    properties: Object.fromEntries(Object.entries(properties).filter(([key]) => allowed.has(key))),
  };
}

/** Owners (T3's account ids) are never sent. */
const recordNoOwners = Effect.fn("AnalyticsService.recordOwners")(() => Effect.void);

/** Studio's listed events only, sent through `sender`. */
export const listedOnly = (sender: AnalyticsService["Service"]): AnalyticsService["Service"] =>
  AnalyticsService.of({
    record: Effect.fn("AnalyticsService.record")(function* (event, properties) {
      const listed = listedUsageEvent(event, properties);
      if (listed !== undefined) yield* sender.record(event, listed.properties);
    }),
    flush: sender.flush,
    recordOwners: recordNoOwners,
  });

interface BufferedAnalyticsEvent {
  readonly uuid: string;
  readonly event: string;
  readonly properties?: Properties;
  readonly capturedAt: string;
}

interface DeliveryState {
  /** Batch that failed last. It is sent again before newer events. */
  readonly failedBatch: ReadonlyArray<BufferedAnalyticsEvent>;
  /** Failed sends of `failedBatch`. */
  readonly batchAttempts: number;
  /** Failed sends since the last success. Sets the backoff delay. */
  readonly failures: number;
  /** The background flush does not send before this time (epoch ms). */
  readonly retryAt: number;
}

const FLUSH_INTERVAL_MS = 1_000;
// A hung send would hold the flush lock, and with it the shutdown flush.
const SEND_TIMEOUT = "10 seconds";
const MAX_BATCH_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 300_000;

/**
 * Delay before the next send after `failures` consecutive failed sends. The
 * ceiling doubles from 2s up to 5 minutes, and the delay is a random point in
 * its upper half. `random` is in [0, 1).
 */
export function retryDelayMs(failures: number, random: number): number {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (failures - 1));
  return Math.round(ceiling / 2 + (ceiling / 2) * random);
}

/** `record` when nothing may be sent: the event is dropped where it is made. */
const recordNothing = Effect.fn("AnalyticsService.record")(() => Effect.void);

const sendNothing = AnalyticsService.of({
  record: recordNothing,
  flush: Effect.void,
  recordOwners: recordNoOwners,
});

const TelemetryEnvConfig = Config.all({
  // Studio's usage receiver (`infra/usage`); a build without it sends nothing.
  usageUrl: Config.String("T3CODE_USAGE_URL").pipe(Config.withDefault("")),
  // T3's own opt-out, still honoured: `false` sends nothing.
  enabled: Config.Boolean("T3CODE_TELEMETRY_ENABLED").pipe(Config.withDefault(true)),
  flushBatchSize: Config.Number("T3CODE_TELEMETRY_FLUSH_BATCH_SIZE").pipe(Config.withDefault(20)),
  maxBufferedEvents: Config.Number("T3CODE_TELEMETRY_MAX_BUFFERED_EVENTS").pipe(
    Config.withDefault(1_000),
  ),
  doNotTrack: Config.String("DO_NOT_TRACK").pipe(Config.withDefault("")),
  ci: Config.String("CI").pipe(Config.withDefault("")),
});

/** An environment flag set to anything but empty, `0` or `false`. */
const isSet = (value: string) => value.trim() !== "" && !/^(?:0|false)$/i.test(value.trim());

/**
 * Whether usage counts can be sent at all: the build names a receiver, and the machine has not opted
 * out (`DO_NOT_TRACK`, consoledonottrack.com, or T3's `T3CODE_TELEMETRY_ENABLED=false`) and is not a
 * CI run.
 */
const canSend = (config: Config.Success<typeof TelemetryEnvConfig>) =>
  config.enabled && config.usageUrl !== "" && !isSet(config.doNotTrack) && !isSet(config.ci);

/**
 * The random id this install's usage counts go under (`anonymous-id` in the state directory, the
 * file T3's analytics also keeps), made on first use, and the one thing a deletion names. It is
 * never derived from an account. Null when it cannot be read or made, and then nothing is sent.
 */
export const getInstallId = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const { anonymousIdPath } = yield* ServerConfig.ServerConfig;
  const existing = yield* fileSystem.readFileString(anonymousIdPath).pipe(
    Effect.asSome,
    Effect.catchTags({
      PlatformError: (cause) =>
        cause.reason._tag === "NotFound"
          ? Effect.succeed(Option.none<string>())
          : Effect.fail(cause),
    }),
  );
  if (Option.isSome(existing)) return existing.value;
  const installId = yield* SecureRandom.SecureRandom.pipe(
    Effect.flatMap((crypto) => crypto.uuidV4()),
  );
  yield* writeFileStringAtomically({ filePath: anonymousIdPath, contents: installId });
  return installId;
}).pipe(
  Effect.tapCause((cause) =>
    Effect.logWarning("Could not read or make the usage install id", cause),
  ),
  Effect.orElseSucceed(() => null),
);

/** Whether this build can send usage counts on this machine: what Settings' switch shows for. */
export const usageDataAvailable = Effect.map(TelemetryEnvConfig, canSend);

/** The id this machine's usage counts go under, for a problem report to name; null when none are sent. */
export const usageId = Effect.flatMap(usageDataAvailable, (available) =>
  available ? getInstallId : Effect.succeed(null),
);

/** Sends whatever it is given to Studio's receiver; `layer` puts the event list in front of it. */
export const make = Effect.gen(function* () {
  const telemetryConfig = yield* TelemetryEnvConfig;
  const version = yield* appVersion;
  // A managed policy can switch usage counts off, never on.
  const policy = yield* Effect.serviceOption(ManagedPolicy.ManagedPolicy);
  const policyDenies =
    Option.isSome(policy) && ManagedPolicy.deniedBy(policy.value, "telemetry") !== undefined;
  if (!canSend(telemetryConfig) || policyDenies) return sendNothing;
  const install = yield* getInstallId;
  if (install === null) return sendNothing;
  const httpClient = yield* HttpClient.HttpClient;
  const serverConfig = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  // Read on each event, so turning the setting off in Settings stops events at once.
  const settings = yield* Effect.serviceOption(ServerSettings.ServerSettingsService);
  const crypto = yield* SecureRandom.SecureRandom;
  // A deletion the receiver has not taken yet, kept beside the install id so a restart still owes it.
  const forgetOwedPath = path.join(path.dirname(serverConfig.anonymousIdPath), "usage-forget-owed");
  const forgetOwed = yield* Ref.make(
    yield* fileSystem.exists(forgetOwedPath).pipe(Effect.orElseSucceed(() => false)),
  );
  const forgetDelivery = yield* Ref.make({ failures: 0, retryAt: 0 });
  const bufferRef = yield* Ref.make<ReadonlyArray<BufferedAnalyticsEvent>>([]);
  const deliveryRef = yield* Ref.make<DeliveryState>({
    failedBatch: [],
    batchAttempts: 0,
    failures: 0,
    retryAt: 0,
  });
  // The background flush and the shutdown flush must not send the same batch at once.
  const flushLock = yield* Semaphore.make(1);
  const hostPlatform = yield* HostProcess.Platform;
  const hostArchitecture = yield* HostProcess.Architecture;

  const enqueueBufferedEvent = (uuid: string, event: string, properties?: Properties) =>
    Effect.flatMap(DateTime.now, (now) =>
      Ref.modify(bufferRef, (current) => {
        const appended = [
          ...current,
          {
            uuid,
            event,
            ...(properties ? { properties } : {}),
            capturedAt: DateTime.formatIso(now),
          } satisfies BufferedAnalyticsEvent,
        ];

        const next =
          appended.length > telemetryConfig.maxBufferedEvents
            ? appended.slice(appended.length - telemetryConfig.maxBufferedEvents)
            : appended;

        return [
          {
            size: next.length,
            dropped: next.length !== appended.length,
          } as const,
          next,
        ] as const;
      }),
    );

  const post = (route: string, body: unknown) =>
    HttpClientRequest.post(`${telemetryConfig.usageUrl}${route}`).pipe(
      HttpClientRequest.bodyJson(body),
      Effect.flatMap(httpClient.execute),
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.timeout(SEND_TIMEOUT),
    );

  // Schema 1 of the receiver's contract (`infra/usage/src/events.mjs`).
  const sendBatch = (events: ReadonlyArray<BufferedAnalyticsEvent>) =>
    post("/v1/events", {
      schema: 1,
      install,
      version,
      platform: hostPlatform,
      arch: hostArchitecture,
      mode: serverConfig.mode,
      events: events.map((event) => ({
        id: event.uuid,
        event: event.event,
        at: event.capturedAt,
        ...(event.properties ? { properties: event.properties } : {}),
      })),
    });

  const takeBatch = Ref.modify(bufferRef, (current) => {
    const nextBatch = current.slice(0, telemetryConfig.flushBatchSize);
    return [nextBatch, current.slice(nextBatch.length)] as const;
  });

  // Sends batches until the buffer is empty or a send fails. A failed batch is
  // kept for the next flush, and dropped after MAX_BATCH_ATTEMPTS failed sends.
  const flush: AnalyticsService["Service"]["flush"] = Effect.gen(function* () {
    // Nothing goes out while a deletion is owed: it would delete it too.
    if (yield* Ref.get(forgetOwed)) return;
    while (true) {
      const delivery = yield* Ref.get(deliveryRef);
      const batch = delivery.failedBatch.length > 0 ? delivery.failedBatch : yield* takeBatch;
      if (batch.length === 0) {
        return;
      }

      const sent = yield* Effect.result(sendBatch(batch));
      if (Result.isSuccess(sent)) {
        yield* Ref.set(deliveryRef, { failedBatch: [], batchAttempts: 0, failures: 0, retryAt: 0 });
        continue;
      }

      const failures = delivery.failures + 1;
      const batchAttempts = delivery.batchAttempts + 1;
      const retryAt = (yield* Clock.currentTimeMillis) + retryDelayMs(failures, yield* Random.next);
      if (batchAttempts < MAX_BATCH_ATTEMPTS) {
        yield* Ref.set(deliveryRef, { failedBatch: batch, batchAttempts, failures, retryAt });
        yield* Effect.logDebug("Failed to send telemetry batch; will retry", {
          attempt: batchAttempts,
          cause: sent.failure,
        });
        return;
      }
      yield* Ref.set(deliveryRef, { failedBatch: [], batchAttempts: 0, failures, retryAt });
      yield* Effect.logWarning("Dropped telemetry batch after repeated send failures", {
        events: batch.length,
        attempts: batchAttempts,
        cause: sent.failure,
      });
      return;
    }
  }).pipe(flushLock.withPermit);

  // Drops what is waiting and owes the receiver a deletion of everything sent under the install id.
  const owe = Effect.gen(function* () {
    yield* Ref.set(bufferRef, []);
    yield* Ref.set(deliveryRef, { failedBatch: [], batchAttempts: 0, failures: 0, retryAt: 0 });
    yield* Ref.set(forgetOwed, true);
    yield* fileSystem.writeFileString(forgetOwedPath, install).pipe(Effect.ignore);
  }).pipe(flushLock.withPermit);

  // Asks the receiver to delete, backing off like a batch while it refuses or cannot be reached.
  const forgetWhenOwed = Effect.gen(function* () {
    if (!(yield* Ref.get(forgetOwed))) return;
    const { failures, retryAt } = yield* Ref.get(forgetDelivery);
    if ((yield* Clock.currentTimeMillis) < retryAt) return;
    const sent = yield* Effect.result(post("/v1/forget", { install }));
    if (Result.isSuccess(sent)) {
      yield* Ref.set(forgetOwed, false);
      yield* Ref.set(forgetDelivery, { failures: 0, retryAt: 0 });
      yield* fileSystem.remove(forgetOwedPath).pipe(Effect.ignore);
      return;
    }
    const next = failures + 1;
    yield* Ref.set(forgetDelivery, {
      failures: next,
      retryAt: (yield* Clock.currentTimeMillis) + retryDelayMs(next, yield* Random.next),
    });
    yield* Effect.logDebug("Failed to ask for usage data to be deleted; will retry", {
      attempt: next,
      cause: sent.failure,
    });
  }).pipe(flushLock.withPermit);

  const flushWhenDue = Effect.gen(function* () {
    const { retryAt } = yield* Ref.get(deliveryRef);
    if ((yield* Clock.currentTimeMillis) >= retryAt) {
      yield* flush;
    }
  });

  const record: AnalyticsService["Service"]["record"] = Effect.fn("AnalyticsService.record")(
    function* (event, properties) {
      if (Option.isSome(settings)) {
        // Nothing counted before the person was told is sent, nor anything after their no.
        const sharing = yield* settings.value.getSettings.pipe(
          Effect.map((current) => current.shareUsageData && current.usageDataAnswered),
          Effect.orElseSucceed(() => false),
        );
        if (!sharing) return;
      }

      // Telemetry is best effort: an event without a uuid is not sent. The
      // Node implementation throws (a defect) rather than failing, so catch both.
      const uuid = yield* Effect.exit(crypto.uuidV7());
      if (Exit.isFailure(uuid)) return;

      const enqueueResult = yield* enqueueBufferedEvent(uuid.value, event, properties);
      if (enqueueResult.dropped) {
        yield* Effect.logDebug("analytics buffer full; dropping oldest event", {
          size: enqueueResult.size,
          event,
        });
      }
    },
  );

  // Turning sharing off after saying yes owes a deletion of what was sent. A no before any yes owes
  // nothing, and contacts nobody; turning it on again owes nothing either.
  if (Option.isSome(settings)) {
    const consenting = (current: { shareUsageData: boolean; usageDataAnswered: boolean }) =>
      current.shareUsageData && current.usageDataAnswered;
    const shared = yield* Ref.make(
      yield* settings.value.getSettings.pipe(
        Effect.map(consenting),
        Effect.orElseSucceed(() => false),
      ),
    );
    yield* settings.value.streamChanges.pipe(
      Stream.runForEach((next) =>
        Ref.getAndSet(shared, consenting(next)).pipe(
          Effect.flatMap((was) => (was && !next.shareUsageData ? owe : Effect.void)),
        ),
      ),
      Effect.forkScoped,
    );
  }

  yield* Effect.forever(
    Effect.sleep(FLUSH_INTERVAL_MS).pipe(
      Effect.andThen(forgetWhenOwed),
      Effect.andThen(flushWhenDue),
    ),
    { disableYield: true },
  ).pipe(Effect.forkScoped);

  yield* Effect.addFinalizer(() => forgetWhenOwed.pipe(Effect.andThen(flush)));

  return AnalyticsService.of({ record, flush, recordOwners: recordNoOwners });
});

/** Sends any event it is given; for the sender's own tests. */
export const layerSender = Layer.effect(AnalyticsService, make);

/** What the server provides as `AnalyticsService`: Studio's listed events only. */
export const layer = Layer.effect(AnalyticsService, Effect.map(make, listedOnly));
