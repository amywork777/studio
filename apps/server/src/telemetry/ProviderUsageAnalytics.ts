/**
 * Provider token reporting: one `provider.turn.completed` per provider turn. Studio sends no
 * per-run summary (T3's `provider.request.completed`), since README's "Usage data" does not list
 * one, and each turn carries only the properties the receiver (`infra/usage/src/events.mjs`) takes.
 *
 * @module ProviderUsageAnalytics
 */
import type {
  ModelSelection,
  OrchestrationV2Actor,
  OrchestrationV2CreationSource,
  OrchestrationV2ProviderTurn,
  OrchestrationV2RunAttempt,
  ProviderInteractionMode,
  RunId,
  RuntimeMode,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as AnalyticsService from "./AnalyticsService.ts";
import { catalogModelLabel } from "./ProviderDimensions.ts";

/**
 * Where the run's starting message came from. The orchestrator carries it with each turn; Studio's
 * usage data sends none of it.
 */
export interface ProviderTurnOrigin {
  readonly createdBy: OrchestrationV2Actor;
  readonly creationSource: OrchestrationV2CreationSource;
  readonly scheduled: boolean;
  readonly subagent: boolean;
}

/** What started this provider turn inside its run. */
export type ProviderTurnSegment =
  | OrchestrationV2RunAttempt["reason"]
  | "continuation"
  | "native_child";

export interface ProviderTurnAnalyticsContext {
  readonly runId?: RunId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode?: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode;
  readonly origin?: ProviderTurnOrigin;
  readonly segment?: ProviderTurnSegment;
  readonly restartContinuation?: boolean;
}

export interface ProviderTurnReport {
  readonly driver: string;
  readonly providerTurn: OrchestrationV2ProviderTurn;
  readonly context?: ProviderTurnAnalyticsContext;
}

type Properties = Readonly<Record<string, unknown>>;
/** Maps a native model id to a vendor catalog label, or undefined to keep it out. */
export type ModelLabeler = (model: string) => string | undefined;

const REPORTED_EFFORTS: ReadonlySet<string> = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultrathink",
  "ultracode",
  "brutal",
]);

// OpenCode names its effort option `variant`, and variants can be user-defined.
function selectedEffort(selection: ModelSelection): string | undefined {
  const effort =
    getModelSelectionStringOptionValue(selection, "reasoningEffort") ??
    getModelSelectionStringOptionValue(selection, "effort") ??
    getModelSelectionStringOptionValue(selection, "variant");
  return effort !== undefined && REPORTED_EFFORTS.has(effort) ? effort : undefined;
}

/**
 * Whether the turn ran on more than one model, from the models the provider itself reported;
 * unknown (absent) when it reported none.
 */
function mixedModels(models: ReadonlyArray<string> | undefined): boolean | undefined {
  const distinct = new Set(models ?? []);
  return distinct.size === 0 ? undefined : distinct.size > 1;
}

/**
 * Exactly the properties the receiver takes for `provider.turn.completed`: a batch with any other
 * is refused whole. `infra/usage/src/events.test.mjs` reads this object back, so adding one here
 * means adding it there too.
 */
export function providerTurnProperties(
  report: ProviderTurnReport,
  label: ModelLabeler,
): Properties {
  const { providerTurn, context } = report;
  const usage = providerTurn.turnTokenUsage;
  const selection = context?.modelSelection;
  const model = selection === undefined ? undefined : label(selection.model);
  const effort = selection === undefined ? undefined : selectedEffort(selection);
  const mixed = mixedModels(usage?.models);
  const { startedAt, completedAt } = providerTurn;
  return {
    provider: report.driver,
    terminalStatus: providerTurn.status,
    usageStatus: usage?.usageStatus ?? "unavailable",
    usageScope: usage?.usageScope ?? "main_agent",
    ...(usage?.hasSubagents === undefined ? {} : { hasSubagents: usage.hasSubagents }),
    ...(usage?.inputTokens === undefined ? {} : { inputTokens: usage.inputTokens }),
    ...(usage?.cachedInputTokens === undefined
      ? {}
      : { cachedInputTokens: usage.cachedInputTokens }),
    ...(usage?.cacheCreationTokens === undefined
      ? {}
      : { cacheCreationTokens: usage.cacheCreationTokens }),
    ...(usage?.outputTokens === undefined ? {} : { outputTokens: usage.outputTokens }),
    ...(usage?.reasoningTokens === undefined ? {} : { reasoningTokens: usage.reasoningTokens }),
    ...(model === undefined ? {} : { model }),
    ...(mixed === undefined ? {} : { mixedModels: mixed }),
    ...(effort === undefined ? {} : { effort }),
    ...(context?.runtimeMode === undefined ? {} : { runtimeMode: context.runtimeMode }),
    ...(context?.interactionMode === undefined
      ? {}
      : { interactionMode: context.interactionMode }),
    ...(startedAt && completedAt
      ? {
          durationMs: Math.max(
            0,
            DateTime.toEpochMillis(completedAt) - DateTime.toEpochMillis(startedAt),
          ),
        }
      : {}),
  };
}

export class ProviderTurnAnalytics extends Context.Reference<{
  readonly turnCompleted: (report: ProviderTurnReport) => Effect.Effect<void>;
}>("t3/telemetry/ProviderTurnAnalytics", {
  defaultValue: () => ({ turnCompleted: () => Effect.void }),
}) {}

export const layer = Layer.effect(
  ProviderTurnAnalytics,
  Effect.gen(function* () {
    const analytics = yield* AnalyticsService.AnalyticsService;
    const registry = yield* ProviderRegistry.ProviderRegistry;
    const labeler = Effect.map(
      registry.getProviders,
      (providers): ModelLabeler =>
        (model) =>
          catalogModelLabel(providers, model),
    );
    return {
      turnCompleted: Effect.fn("ProviderTurnAnalytics.turnCompleted")(function* (report) {
        yield* analytics.record(
          "provider.turn.completed",
          providerTurnProperties(report, yield* labeler),
        );
      }),
    };
  }),
);
