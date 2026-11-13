/**
 * Which Studio skills and jobs a sent message asked for (`studio.skill.used`): a job's `Tool: <label>`
 * line or a skill typed by name (`$fdm`). Names come only from the closed list in `toolboxJobs.json`,
 * so a person's own skill or any other word they typed is never counted or sent.
 */
import jobs from "./toolboxJobs.json" with { type: "json" };

export interface SkillUse {
  /** The text-to-cad skill, or `none` for a job of Studio's own. */
  readonly skill: string;
  /** The job, or `none` for a skill asked for by name. */
  readonly job: string;
  /** `tool`: a Toolbox tile, job menu or Quick Find; `typed`: named in the message. */
  readonly how: "tool" | "typed";
}

const TOOL_LINE = /(?:^|\s+)Tool: ([^\n]+)\n+/gu;
// `$name` as the composer writes a skill (packages/shared's `inlineSkills.ts`), on its own between spaces.
const SKILL_TOKEN = /(?:^|\s)\$([a-z0-9][a-z0-9_-]*)(?=\s|$)/gu;

const byLabel = new Map(jobs.map((job) => [job.label, job]));
const byId = new Map(jobs.map((job) => [job.id, job]));
const skills = new Set(jobs.flatMap((job) => (job.skill === null ? [] : [job.skill])));

/** Each skill or job a message asked for, once each. */
export function skillsUsed(text: string): ReadonlyArray<SkillUse> {
  const found = new Map<string, SkillUse>();
  const add = (use: SkillUse) => found.set(`${use.skill} ${use.job}`, use);
  for (const [, label] of text.matchAll(TOOL_LINE)) {
    const job = byLabel.get(label ?? "");
    if (job !== undefined) add({ skill: job.skill ?? "none", job: job.id, how: "tool" });
  }
  for (const [, name = ""] of text.matchAll(SKILL_TOKEN)) {
    const job = byId.get(name);
    // A job that is a skill of its own (`$fdm`) is named by its job; a skill (`$cad`) by itself.
    if (job !== undefined && job.skill !== name) {
      add({ skill: job.skill ?? "none", job: job.id, how: "typed" });
    } else if (skills.has(name)) add({ skill: name, job: "none", how: "typed" });
  }
  return [...found.values()];
}
