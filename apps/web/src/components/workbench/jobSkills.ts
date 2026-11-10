/**
 * Each job of a text-to-cad skill that does more than one (`HARDWARE_ACTIONS`) as a skill of its
 * own, so a person can call one job by name in the chat (`$fdm`, `$export`, `$board-fab`) and find it on
 * the Toolbox page with its own cover. A job's skill only hands off: it names the job as its part
 * Toolbox tile does and sends the agent to the text-to-cad skill that does it. Its files are written
 * from here into `studio-job-skills/` (`jobSkills.test.ts` keeps them the same), and Studio adds that
 * folder to the text-to-cad plugin it lays out (`scripts/studio_job_skills.py`), so `text-to-cad/`
 * itself holds only Jake's.
 */

import { HARDWARE_ACTIONS, jobLine, type HardwareAction } from "./hardwareActions";

/** A job that is a skill of its own: one of a text-to-cad skill's jobs, where it has more than one. */
export interface JobSkillJob extends HardwareAction {
  readonly skill: string;
}

const jobsOf = (skill: string) => HARDWARE_ACTIONS.filter((job) => job.skill === skill);

/** The jobs that are skills of their own, in the menus' order. */
export const JOB_SKILL_JOBS: ReadonlyArray<JobSkillJob> = HARDWARE_ACTIONS.filter(
  (job): job is JobSkillJob => job.skill !== null && jobsOf(job.skill).length > 1,
);

/** The job a skill of this name is, or null for any other skill. */
export function jobOfSkill(name: string): JobSkillJob | null {
  return JOB_SKILL_JOBS.find((job) => job.id === name) ?? null;
}

/** What a job works on, as a person names it: the first of its kinds. */
const SUBJECTS: Readonly<Record<string, string>> = {
  Part: "the part",
  Assembly: "the assembly",
  Mesh: "the mesh",
  Drawing: "the drawing",
  Board: "the board",
  Schematic: "the schematic",
  "FEA study": "the study",
  Result: "the result",
  "CAM job": "the CAM job",
};

const subjectOf = (job: HardwareAction) =>
  SUBJECTS[job.kinds?.[0] ?? "Part"] ?? `the ${job.kinds?.[0]?.toLowerCase() ?? "part"}`;

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** A YAML string: JSON's double-quoted form, which YAML reads the same. */
const yamlString = (text: string) => JSON.stringify(text);

/** A job skill's files, by path inside its folder. */
export function jobSkillFiles(job: JobSkillJob): Readonly<Record<string, string>> {
  const subject = subjectOf(job);
  const ask = job.prompt(subject);
  const description =
    `${job.label}, one job of the ${job.skill} skill. Use when the person asks for $${job.id} ` +
    `by name; it hands off to the ${job.skill} skill.`;
  const skill = [
    "---",
    `name: ${job.id}`,
    `description: ${yamlString(description)}`,
    "---",
    "",
    `# ${job.label}`,
    "",
    `One job, the same one as the "${job.label}" tile in a part's Toolbox in Studio. Do it with`,
    `the \`${job.skill}\` skill: read that skill first and follow it, then do what the person asks:`,
    "",
    `> ${ask}`,
    "",
    `${subject.charAt(0).toUpperCase()}${subject.slice(1)} is the one the person names, else the one open beside the chat.`,
    "Ask which when neither says.",
    "",
    `What they get: ${jobLine(job)}`,
    "",
  ].join("\n");
  const face = [
    "interface:",
    `  display_name: ${yamlString(job.label)}`,
    `  short_description: ${yamlString(jobLine(job))}`,
    `  default_prompt: ${yamlString(`Use $${job.id} to ${lowerFirst(ask)}`)}`,
    "",
  ].join("\n");
  return { "SKILL.md": skill, "agents/openai.yaml": face };
}
