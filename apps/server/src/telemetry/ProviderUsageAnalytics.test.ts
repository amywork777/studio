import {
  NodeId,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
  type OrchestrationV2ProviderTurn,
  type ServerProvider,
  type TurnTokenUsage,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as AnalyticsService from "./AnalyticsService.ts";
import { catalogModelLabel } from "./ProviderDimensions.ts";
import {
  ProviderTurnAnalytics,
  layer,
  providerTurnProperties,
  type ProviderTurnAnalyticsContext,
  type ProviderTurnSegment,
} from "./ProviderUsageAnalytics.ts";

const providers = [
  // Codex lists whatever its configured model provider serves, including private deployments.
  { driver: "codex", models: [{ slug: "gpt-6-sol" }, { slug: "acme-azure-deployment" }] },
  { driver: "claudeAgent", models: [{ slug: "claude-opus-5-5" }, { slug: "claude-haiku-4-5" }] },
  { driver: "opencode", models: [{ slug: "ollama/acme-internal" }] },
].map(
  ({ driver, models }) =>
    ({
      instanceId: ProviderInstanceId.make(driver),
      driver,
      models: models.map((model) => ({ ...model, isCustom: false })),
    }) as unknown as ServerProvider,
);
const label = (model: string) => catalogModelLabel(providers, model);

const at = (ms: number) => DateTime.makeUnsafe(ms);
const complete = (input: number, output: number, extra: Partial<TurnTokenUsage> = {}) =>
  ({
    usageStatus: "complete",
    usageScope: "main_agent",
    hasSubagents: false,
    inputTokens: input,
    outputTokens: output,
    ...extra,
  }) as TurnTokenUsage;

const turn = (
  id: string,
  usage: TurnTokenUsage | undefined,
  status: OrchestrationV2ProviderTurn["status"] = "completed",
): OrchestrationV2ProviderTurn => ({
  id: ProviderTurnId.make(id),
  providerThreadId: ProviderThreadId.make("provider-thread"),
  nodeId: NodeId.make(`node:${id}`),
  runAttemptId: null,
  nativeTurnRef: null,
  ordinal: 1,
  status,
  startedAt: at(1_000),
  completedAt: at(4_000),
  ...(usage === undefined ? {} : { turnTokenUsage: usage }),
});

const context = (
  runId: string,
  segment: ProviderTurnSegment,
  model = "gpt-6-sol",
): ProviderTurnAnalyticsContext => ({
  runId: RunId.make(runId),
  modelSelection: {
    instanceId: ProviderInstanceId.make("codex"),
    model,
    options: [
      { id: "reasoningEffort", value: "xhigh" },
      { id: "serviceTier", value: "priority" },
    ],
  },
  runtimeMode: "full-access",
  interactionMode: "default",
  origin: { createdBy: "user", creationSource: "web", scheduled: false, subagent: false },
  segment,
});

describe("provider usage reporting", () => {
  it.effect("records one turn with Studio's properties only, never a per-run summary", () => {
    const recorded: Array<readonly [string, unknown]> = [];
    const layerTest = layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(AnalyticsService.AnalyticsService)({
            record: (event, properties) =>
              Effect.sync(() => void recorded.push([event, properties])),
          }),
          Layer.mock(ProviderRegistry.ProviderRegistry)({
            getProviders: Effect.succeed(providers),
          }),
        ),
      ),
    );
    return Effect.gen(function* () {
      const analytics = yield* ProviderTurnAnalytics;
      yield* analytics.turnCompleted({
        driver: "codex",
        context: context("run-a", "initial"),
        providerTurn: turn("root", complete(100, 10, { models: ["gpt-6-sol"] })),
      });
      // The whole payload: no run, turn, or thread ids, no origin, prompts, or raw model names.
      expect(recorded).toEqual([
        [
          "provider.turn.completed",
          {
            provider: "codex",
            terminalStatus: "completed",
            usageStatus: "complete",
            usageScope: "main_agent",
            hasSubagents: false,
            inputTokens: 100,
            outputTokens: 10,
            model: "gpt-6-sol",
            mixedModels: false,
            effort: "xhigh",
            runtimeMode: "full-access",
            interactionMode: "default",
            durationMs: 3_000,
          },
        ],
      ]);
    }).pipe(Effect.provide(layerTest));
  });

  it("confirms only the models a provider reported", () => {
    const opus = context("models", "initial", "claude-opus-5-5");
    const properties = (usage: TurnTokenUsage | undefined) =>
      providerTurnProperties(
        { driver: "claudeAgent", context: opus, providerTurn: turn("t", usage) },
        label,
      );
    const confirmed = properties(complete(1, 1, { models: ["claude-haiku-4-5-20251001"] }));
    expect(confirmed).toMatchObject({ model: "claude-opus-5-5", mixedModels: false });
    expect(confirmed).not.toHaveProperty("observedModel");
    const unconfirmed = properties(complete(1, 1));
    expect(unconfirmed).toMatchObject({ model: "claude-opus-5-5" });
    expect(unconfirmed).not.toHaveProperty("mixedModels");
    expect(properties(complete(1, 1, { models: ["a", "b"] }))).toMatchObject({ mixedModels: true });

  });

  it("keeps zero and absent usage distinct, and sends no field the receiver refuses", () => {
    const properties = (usage: TurnTokenUsage | undefined) =>
      providerTurnProperties(
        { driver: "claudeAgent", context: context("z", "initial"), providerTurn: turn("t", usage) },
        label,
      );
    expect(properties(complete(0, 0))).toMatchObject({
      usageStatus: "complete",
      inputTokens: 0,
      outputTokens: 0,
    });
    const absent = properties(undefined);
    expect(absent).toMatchObject({ usageStatus: "unavailable" });
    expect(absent).not.toHaveProperty("outputTokens");
    expect(absent).not.toHaveProperty("hasSubagents");
    const local = properties(
      complete(0, 0, { localCommand: true, otherUsage: { inputTokens: 900, outputTokens: 80 } }),
    );
    for (const refused of [
      "reportVersion",
      "usageReported",
      "localCommand",
      "otherInputTokens",
      "otherOutputTokens",
      "serviceTier",
      "createdBy",
      "creationSource",
      "scheduled",
      "subagent",
      "segment",
      "childKind",
    ]) {
      expect(local).not.toHaveProperty(refused);
    }
    expect(properties(complete(74_167, 236, { reasoningTokens: 30 }))).toMatchObject({
      outputTokens: 236,
      reasoningTokens: 30,
    });
  });

  it("reports routed catalog models and closed efforts only", () => {
    const routed = (model: string, variant: string) =>
      providerTurnProperties(
        {
          driver: "opencode",
          context: {
            modelSelection: {
              instanceId: ProviderInstanceId.make("opencode"),
              model,
              options: [{ id: "variant", value: variant }],
            },
          },
          providerTurn: turn("t", complete(1, 1, { models: [model] })),
        },
        label,
      );
    expect(routed("my-proxy/claude-opus-5-5", "high")).toMatchObject({
      model: "claude-opus-5-5",
      effort: "high",
    });
    for (const local of [
      routed("ollama/acme-internal", "secret-variant"),
      routed("acme-azure-deployment", "high"),
    ]) {
      expect(local).not.toHaveProperty("model");
    }
    expect(routed("ollama/acme-internal", "secret-variant")).not.toHaveProperty("effort");
  });
});
