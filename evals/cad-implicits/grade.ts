import type { BuildChecks, Expected } from "./cases.ts";

/** What a run's transcript (Claude Code's stream-json) says the agent did. */
export interface RunFacts {
  readonly gslFiles: ReadonlyArray<string>;
  readonly commands: ReadonlyArray<string>;
  /** `cad gsl step` commands, and whether each was refused for its tolerance. */
  readonly stepRuns: ReadonlyArray<{ readonly command: string; readonly refused: boolean }>;
  readonly finalText: string;
  readonly costUsd: number;
  readonly turns: number;
  readonly loadedCadSkill: boolean;
  /** Tokens by kind, each assistant message once: what a run cut off before its result line spent. */
  readonly tokens: {
    readonly input: number;
    readonly cacheWrite: number;
    readonly cacheRead: number;
    readonly output: number;
  };
}

/** What `build_check.py` measured of the part the case judges. */
export interface BuildFacts {
  readonly built: boolean;
  readonly error?: string;
  readonly valid?: boolean;
  readonly solids?: number;
  readonly volume?: number;
  readonly seedVolume?: number | null;
  readonly cylinders?: ReadonlyArray<number>;
  readonly facets?: number;
  readonly baseArea?: number;
  readonly seedBaseArea?: number | null;
  readonly stepValid?: boolean;
  readonly stepBytes?: number;
  readonly buildSeconds?: number;
  readonly watertight?: boolean;
  readonly bodies?: number;
  readonly minWall?: number | null;
  /** Round faces that are neither plane nor cylinder (a fillet round a boss: a torus or a B-spline). */
  readonly blends?: number;
  /** `cad gsl step` at its defaults on the project's `.gsl` files. */
  readonly gslSteps?: ReadonlyArray<{
    readonly file: string;
    readonly ok: boolean;
    readonly depth?: number | null;
  }>;
}

interface StreamBlock {
  readonly type?: string;
  readonly text?: string;
  readonly name?: string;
  readonly id?: string;
  readonly tool_use_id?: string;
  readonly input?: Record<string, unknown>;
  readonly content?: unknown;
}

interface StreamEvent {
  readonly type?: string;
  readonly message?: {
    readonly id?: string;
    readonly content?: ReadonlyArray<StreamBlock>;
    readonly usage?: Record<string, number | undefined>;
  };
  readonly total_cost_usd?: number;
  readonly num_turns?: number;
}

const contentText = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n")
      : "";

/** The facts of one run, from its stream-json lines. */
export function runFacts(stream: string): RunFacts {
  const events: StreamEvent[] = [];
  for (const line of stream.split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      events.push(JSON.parse(line) as StreamEvent);
    } catch {
      // A line cut off by a timeout is not an event.
    }
  }
  const texts: string[] = [];
  const gslFiles = new Set<string>();
  const commands: string[] = [];
  const stepIds = new Map<string, string>();
  const stepRuns: { command: string; refused: boolean }[] = [];
  let costUsd = 0;
  let turns = 0;
  let loadedCadSkill = false;
  const usage = new Map<string, Record<string, number | undefined>>();
  for (const event of events) {
    if (event.type === "assistant" && event.message?.id && event.message.usage)
      usage.set(event.message.id, event.message.usage);
    if (event.type === "result") {
      costUsd = event.total_cost_usd ?? 0;
      turns = event.num_turns ?? 0;
    }
    for (const block of event.message?.content ?? []) {
      if (event.type === "assistant" && block.type === "text" && block.text) texts.push(block.text);
      if (event.type === "assistant" && block.type === "tool_use") {
        const input = block.input ?? {};
        const file = typeof input.file_path === "string" ? input.file_path : "";
        if ((block.name === "Write" || block.name === "Edit") && file.endsWith(".gsl"))
          gslFiles.add(file);
        if (block.name === "Skill" && String(input.skill ?? input.command ?? "").endsWith("cad"))
          loadedCadSkill = true;
        if (block.name === "Bash" && typeof input.command === "string") {
          commands.push(input.command);
          if (/\bcad\s+gsl\s+step\b/.test(input.command) && block.id)
            stepIds.set(block.id, input.command);
        }
      }
      if (event.type === "user" && block.type === "tool_result" && block.tool_use_id) {
        const command = stepIds.get(block.tool_use_id);
        if (command !== undefined)
          stepRuns.push({
            command,
            refused: /step_outside_tolerance/.test(contentText(block.content)),
          });
      }
    }
  }
  return {
    gslFiles: [...gslFiles],
    commands,
    stepRuns,
    finalText: texts.at(-1) ?? "",
    costUsd,
    turns,
    loadedCadSkill,
    tokens: [...usage.values()].reduce<RunFacts["tokens"]>(
      (sum, each) => ({
        input: sum.input + (each.input_tokens ?? 0),
        cacheWrite: sum.cacheWrite + (each.cache_creation_input_tokens ?? 0),
        cacheRead: sum.cacheRead + (each.cache_read_input_tokens ?? 0),
        output: sum.output + (each.output_tokens ?? 0),
      }),
      { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 },
    ),
  };
}

/** Small triangular flat faces beyond which a part holds a meshed field. */
export const FACETED = 50;

const IMPLICIT_WORDS = /\b(gsl|implicit|smooth blend|gyroid|lattice)\b/i;

/** Whether the reply offers an implicit route as a question: a paragraph that names one and asks. */
export function offersImplicit(text: string): boolean {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .split(/\n\s*\n/)
    .some((paragraph) => IMPLICIT_WORDS.test(paragraph) && /\?/.test(paragraph));
}

export type Decision = "gsl" | "offer" | "exact";

export function decision(facts: RunFacts): Decision {
  if (facts.gslFiles.length > 0) return "gsl";
  return offersImplicit(facts.finalText) ? "offer" : "exact";
}

export function decisionPasses(expected: Expected, made: Decision): boolean {
  if (expected === "exact-or-offer") return made !== "gsl";
  if (expected === "exact-or-gsl") return made !== "offer";
  return made === expected;
}

/** Each failed build check, in words; none when the part holds. */
export function buildProblems(checks: BuildChecks, build: BuildFacts, made: Decision): string[] {
  if (!build.built) return [`not built: ${build.error ?? "no part"}`];
  const problems: string[] = [];
  if (!build.valid || build.solids !== 1)
    problems.push(`not one valid solid (${build.solids ?? 0} solids)`);
  if (!build.stepValid) problems.push("STEP does not read back as a valid solid");
  if (build.watertight === false || (build.bodies ?? 1) !== 1)
    problems.push("mesh not one watertight body");
  for (const hole of checks.holes ?? []) {
    const found = (build.cylinders ?? []).filter(
      (radius) => Math.abs(radius - hole.radius) <= 0.25,
    ).length;
    if (found < hole.count)
      problems.push(`${found} exact r${hole.radius} holes, want ${hole.count}`);
  }
  if (checks.baseKept !== undefined && build.seedBaseArea) {
    const kept = (build.baseArea ?? 0) / build.seedBaseArea;
    if (kept < checks.baseKept)
      problems.push(`flat base ${(kept * 100).toFixed(0)}% of the seed's`);
  }
  if (checks.volumeRatio && build.seedVolume && build.volume !== undefined) {
    const ratio = build.volume / build.seedVolume;
    const [low, high] = checks.volumeRatio;
    if (ratio < low || ratio > high)
      problems.push(`volume ${(ratio * 100).toFixed(0)}% of the seed's`);
  }
  if (checks.blend !== undefined) {
    const rounds = (build.cylinders ?? []).filter(
      (radius) => Math.abs(radius - checks.blend!) <= 0.1,
    ).length;
    if (rounds < 2 && (build.facets ?? 0) <= FACETED && (build.blends ?? 0) === 0)
      problems.push(`no R${checks.blend} blend in the part`);
  }
  // An exact part has a few small triangles of its own (a chamfer's corner); a field's mesh has thousands.
  const faceted = (build.facets ?? 0) > FACETED;
  if (made === "gsl" && !faceted) problems.push("GSL written but none of it in the part");
  if (made !== "gsl" && faceted) problems.push("faceted faces in a part kept exact");
  return problems;
}
