/**
 * The agent's steps in an engineer's words, for the engineering interface: a
 * shell command reads as what it did to the design ("FEA study on the L
 * bracket", "Built the L bracket") instead of the command line, and a step
 * that read or changed files names the parts and documents they are. The
 * command itself stays one click away, in the step's details.
 */

import { APP_BASE_NAME } from "../../branding";
import { changesPhrase, designChanges } from "./designChanges";
import { humanName, inSentence, partLabel } from "./partNames";

export interface StepLabel {
  /** Settled: "FEA study on the L bracket". */
  readonly done: string;
  /** In progress: "Running an FEA study on the L bracket". */
  readonly doing: string;
}

const base = (path: string) =>
  path
    .replace(/^["']|["']$/g, "")
    .split(/[\\/]/)
    .pop() ?? path;

/** The part named by the first argument after `marker` with one of these endings: "the L bracket". */
function fileAfter(command: string, marker: RegExp, endings: RegExp): string | null {
  const at = command.search(marker);
  if (at < 0) return null;
  for (const token of command.slice(at).split(/\s+/)) {
    const file = base(token);
    if (endings.test(file)) return inSentence(partLabel(file));
  }
  return null;
}

/** The part a file is of, by its name alone: "parts/clip.stl" is "the clip", whatever its format. */
function partNamedAfter(command: string, marker: RegExp, endings: RegExp): string | null {
  const at = command.search(marker);
  if (at < 0) return null;
  for (const token of command.slice(at).split(/\s+/)) {
    const file = base(token);
    if (endings.test(file)) return inSentence(humanName(file.replace(/\.[^.]+$/, "")));
  }
  return null;
}

const STEP = /\.(?:step|stp)$/i;
const BOARD = /\.(?:kicad_pcb|kicad_sch)$/i;
const MODEL = /\.(?:step|stp|stl|3mf|glb)$/i;
/** A document the CAD engine reads: a STEP, its own `.xbf`, or a model's script. */
const DOCUMENT = /\.(?:step|stp|xbf|py)$/i;
/** The CAD command line in any spelling (`cad`, `cadgen`, `python -m cad_server.cli`), never "text-to-cad". */
const cli = (rest: string) =>
  new RegExp(String.raw`(?:^|[\s;&|(/])(?:cad(?:gen)?|cad_server)(?:\.cli)?\s+` + rest);
const CLI_SNAPSHOT = cli(String.raw`(?:\S+\s+)*?(?:snapshot|render)\b`);
// 0.11 names the document's type first: `cad step export`, `cad model export <id>`.
const CLI_EXPORT = cli(String.raw`(?:(?:model|xbf|step|stl|glb|threemf)\s+)?export\s+(.*)`);
/** 0.11's `cad <type> solve` and `cad <type> plan`: a stress study, a CAM job. */
const CLI_SOLVE = cli(String.raw`(?:model|xbf|step)\s+solve\b`);
const CLI_PLAN = cli(String.raw`(?:model|xbf|step)\s+plan\b`);
/** A document a study or a CAM job reads: a STEP or an `.xbf`. */
const SOLID = /\.(?:step|stp|xbf)$/i;
const CLI_OLD_EXPORT = cli(String.raw`(stl|3mf|glb|dxf)\b`);
const CLI_INSPECT = cli(String.raw`(?:step\s+)?inspect\b`);
const CLI_DFM = cli(String.raw`[a-z0-9]+\s+dfm\b`);
const CLI_RUN = cli(String.raw`(?:build|run)\s+(?:-\S+\s+)*["']?([^\s"']+\.py)\b`);
const CLI_ANY = cli("[a-z]");
/** A skill's own tool or a helper, not a part's model script: it never "builds" a part. */
const TOOL_SCRIPT = /(?:^|[\\/])(?:scripts?|skills?|tools?|lib|utils?|helpers?)[\\/]|_tool\.py\b/i;
const of = (part: string | null, joiner: string) => (part === null ? "" : ` ${joiner} ${part}`);

const RULES: ReadonlyArray<(command: string) => StepLabel | null> = [
  // `cad step solve part.step --study s.json --out DIR`; with no study it lists what one can name.
  (command) => {
    if (!CLI_SOLVE.test(command)) return null;
    if (/--study\b/.test(command)) {
      const file = of(fileAfter(command, /\bsolve\b/, SOLID), "on");
      return { done: `FEA study${file}`, doing: `Running an FEA study${file}` };
    }
    const file = of(fileAfter(command, /\bsolve\b/, SOLID), "of");
    return { done: `Listed the faces${file}`, doing: `Listing the faces${file}` };
  },
  // `cad step plan part.step --job part.cam.json --out CAM`; with no job it lists the features.
  (command) => {
    if (!CLI_PLAN.test(command)) return null;
    if (/--job\b/.test(command)) {
      const file = of(fileAfter(command, /\bplan\b/, SOLID), "for");
      return { done: `CAM plan${file}`, doing: `Planning the CAM job${file}` };
    }
    const file = of(fileAfter(command, /\bplan\b/, SOLID), "of");
    return {
      done: `Found the machinable features${file}`,
      doing: `Finding machinable features${file}`,
    };
  },
  (command) => {
    if (!/\bfea\s+solve\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bsolve\b/, STEP), "on");
    return { done: `FEA study${file}`, doing: `Running an FEA study${file}` };
  },
  (command) => {
    if (!/\bfea\s+faces\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bfaces\b/, STEP), "of");
    return { done: `Listed the faces${file}`, doing: `Listing the faces${file}` };
  },
  (command) => {
    if (!/\bfea\s+parts\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bparts\b/, STEP), "of");
    return { done: `Listed the parts${file}`, doing: `Listing the parts${file}` };
  },
  (command) => {
    if (!/\bcam\s+plan\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bplan\b/, STEP), "for");
    return { done: `CAM plan${file}`, doing: `Planning the CAM job${file}` };
  },
  (command) => {
    if (!/\bcam\s+features\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bfeatures\b/, STEP), "of");
    return {
      done: `Found the machinable features${file}`,
      doing: `Finding machinable features${file}`,
    };
  },
  (command) => {
    const verb = /\bpcb\s+(validate|review|gerber|bom|pos)\b/.exec(command)?.[1];
    if (verb === undefined) return null;
    const board = fileAfter(command, /\bpcb\b/, BOARD);
    const named = board ?? "the board";
    const [done, doing]: readonly [string, string] = {
      validate: [`Checked ${named}`, `Checking ${named}`] as const,
      review: [`Reviewed ${named}`, `Reviewing ${named}`] as const,
      gerber: ["Wrote the Gerbers", "Writing the Gerbers"] as const,
      bom: ["Wrote the bill of materials", "Writing the bill of materials"] as const,
      pos: ["Wrote the pick-and-place file", "Writing the pick-and-place file"] as const,
    }[verb as "validate" | "review" | "gerber" | "bom" | "pos"];
    if (verb === "validate" || verb === "review") return { done, doing };
    return { done: `${done}${of(board, "for")}`, doing: `${doing}${of(board, "for")}` };
  },
  (command) => {
    if (!CLI_SNAPSHOT.test(command)) return null;
    return { done: "Took a picture of the model", doing: "Taking a picture of the model" };
  },
  // `cad <type> dfm ... --process printing|molding`: the cad skill's manufacturing check.
  (command) => {
    if (!CLI_DFM.test(command)) return null;
    const checked = /--process[=\s]+(printing|molding)\b/.exec(command)?.[1];
    if (checked === undefined) return null;
    const named = partNamedAfter(command, /\bdfm\b/, MODEL) ?? "the part";
    const way = checked === "printing" ? "3D printing" : "molding";
    return { done: `Checked ${named} for ${way}`, doing: `Checking ${named} for ${way}` };
  },
  // The print3d skill's own tool.
  (command) =>
    /\borca_presets\.py\b/.test(command)
      ? { done: "Set up the slicer", doing: "Setting up the slicer" }
      : null,
  // `cad export SRC DST...`: each destination's format is its file's ending.
  (command) => {
    const rest = CLI_EXPORT.exec(command)?.[1];
    if (rest === undefined) return null;
    const [source, ...outputs] = rest.split(/\s+/).filter((token) => !token.startsWith("-"));
    const format = outputs.map((output) => /\.([a-z0-9]+)["']?$/i.exec(output)?.[1]).find(Boolean);
    // A model's document id (`cad model export <id> …`) names no part.
    const part =
      source === undefined || !/\.[a-z0-9]+["']?$/i.test(source)
        ? "the model"
        : inSentence(humanName(base(source).replace(/\.[^.]+$/, "")));
    const as = format === undefined ? "" : ` as ${format.toUpperCase()}`;
    return { done: `Exported ${part}${as}`, doing: `Exporting ${part}${as}` };
  },
  (command) => {
    const format = CLI_OLD_EXPORT.exec(command)?.[1];
    if (format === undefined) return null;
    const part = fileAfter(command, new RegExp(`\\b${format}\\b`), STEP) ?? "the model";
    const as = format.toUpperCase();
    return { done: `Exported ${part} as ${as}`, doing: `Exporting ${part} as ${as}` };
  },
  (command) => {
    if (!CLI_INSPECT.test(command)) return null;
    const part = partNamedAfter(command, /\binspect\b/, DOCUMENT) ?? "the model";
    return { done: `Read ${part}`, doing: `Reading ${part}` };
  },
  (command) =>
    /\b(?:kicad_)?pcb\s+drc\b/.test(command)
      ? { done: "Checked the board", doing: "Checking the board" }
      : null,
  (command) =>
    /\bkicad_sch\s+erc\b/.test(command)
      ? { done: "Checked the schematic", doing: "Checking the schematic" }
      : null,
  // A model script builds its part: `python bracket.py`, through any interpreter or `cad run`.
  (command) => {
    const script =
      CLI_RUN.exec(command)?.[1] ??
      /\bpython3?\s+(?:-\S+\s+)*["']?([^\s"']+\.py)\b/.exec(command)?.[1];
    if (script === undefined) return null;
    // A tool or helper script works on the design; only a part's own script builds it.
    if (TOOL_SCRIPT.test(script)) {
      return { done: "Worked on the design", doing: "Working on the design" };
    }
    const name = inSentence(humanName(base(script).replace(/\.py$/, "")));
    return { done: `Built ${name}`, doing: `Building ${name}` };
  },
  (command) =>
    CLI_ANY.test(command) ? { done: "Worked on the design", doing: "Working on the design" } : null,
  (command) =>
    /^(?:ls|find|cat|head|tail|grep|rg|fd|tree|wc|sed\s+-n|file|stat|du)\b/.test(command)
      ? { done: "Looked through the project", doing: "Looking through the project" }
      : null,
  (command) =>
    /^(?:mkdir|cp|mv|rm|touch|ln)\b/.test(command)
      ? { done: "Organized the project's files", doing: "Organizing the project's files" }
      : null,
  (command) =>
    /^(?:pip3?|uv|uvx|npm|npx|pnpm|brew)\b/.test(command)
      ? { done: "Set up tools", doing: "Setting up tools" }
      : null,
  (command) =>
    /^git\b/.test(command)
      ? { done: "Recorded the project's history", doing: "Recording the project's history" }
      : null,
];

/** The last command of a chain is what it was for: `cd parts && python bracket.py` builds. */
function mainCommand(command: string): string {
  const parts = command
    .split(/\s*(?:&&|\|\||;)\s*/)
    .map((part) => part.trim().replace(/^(?:\w+=\S*\s+)+/, ""))
    .filter((part) => part !== "" && !/^(?:cd|export|source|set)\b/.test(part));
  return parts.at(-1) ?? command.trim();
}

export function engineeringStepLabel(command: string): StepLabel {
  const whole = command.trim();
  for (const rule of RULES) {
    const label = rule(whole);
    if (label !== null) return label;
  }
  const main = mainCommand(whole);
  for (const rule of RULES) {
    const label = rule(main);
    if (label !== null) return label;
  }
  return { done: "Worked on the design", doing: "Working on the design" };
}

/** The text-to-cad plugin's viewer tools, by their name after any server or plugin prefix. */
const CAD_VIEWER_TOOLS: Readonly<Record<string, StepLabel>> = {
  cad_view: { done: "Looked at the model", doing: "Looking at the model" },
  cad_show: { done: "Showed the model", doing: "Showing the model" },
  cad_open: {
    done: "Opened the model in the viewer",
    doing: "Opening the model in the viewer",
  },
  cad_screenshot: {
    done: "Took a picture of the model",
    doing: "Taking a picture of the model",
  },
};

/**
 * A plugin tool's step in an engineer's words, or null for a tool without a
 * rule. Takes the tool's name however the provider spelled it
 * (`mcp__t3-code__text-to-cad__cad_show`, `t3-code.text-to-cad__cad_show`,
 * `cad.cad_show`) or the title made from it ("text to cad cad show").
 */
export function engineeringToolLabel(tool: string | null | undefined): StepLabel | null {
  const name = /(?:^|[.:\s]|__)(cad[_\s][a-z]+)$/i
    .exec(tool?.trim() ?? "")?.[1]
    ?.toLowerCase()
    .replace(/\s/, "_");
  return (name !== undefined && CAD_VIEWER_TOOLS[name]) || null;
}

/**
 * T3's threads as an engineer's chats, in the steps on T3's own tools
 * (`t3McpToolPresentation`: "Listed T3 threads", "Sent to a T3 thread") and
 * their groups ("Created 2 threads"): "Listed chats", "Sent to a chat",
 * "Created 2 chats".
 */
export function engineeringChatWords(label: string): string {
  return label
    .replace(/\bT3 thread metadata\b/g, "chat details")
    .replace(/\b(?:T3 )?thread(s?)\b/g, "chat$1");
}

/**
 * A group of steps in an engineer's words: "Ran 3 commands" reads "3 steps",
 * the tools on T3's own server read as the app's ("Used Studio's tools and
 * took 3 steps"), threads read as chats, and the files it changed are the
 * parts they are ("updated the servo bracket"), given the paths it changed.
 */
export function engineeringGroupLabel(label: string, changed: ReadonlyArray<string> = []): string {
  const { changes, other } = designChanges(changed);
  const phrase = changesPhrase(changes, other);
  const cased = (word: string, like: string) =>
    like[0] === like[0]?.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word;
  return engineeringChatWords(label)
    .replace(
      /\bUsed (.+?) integrations?\b/g,
      (_m, names: string) =>
        `Used ${names.replace(/\bt3[ -]code\b/gi, `${APP_BASE_NAME}'s`)} tools`,
    )
    .replace(
      /\bran (\d+) commands?\b/g,
      (_m, count: string) => `took ${count} ${count === "1" ? "step" : "steps"}`,
    )
    .replace(/\bRan (\d+) commands?\b/g, (_m, count: string) =>
      count === "1" ? "1 step" : `${count} steps`,
    )
    .replace(
      /\b([Cc]hanged) (\d+) (files?)\b/g,
      (_m, verb: string, count: string, noun: string) =>
        `${cased("updated", verb)} ${phrase ?? `${count} ${noun}`}`,
    )
    .replace(/\b([Ss]earched) code\b/g, (_m, verb: string) => `${verb} the project`)
    .replace(
      /\b([Rr]ead) (\d+) (files?)\b/g,
      (_m, verb: string, count: string, noun: string) =>
        `${cased("looked at", verb)} ${count} ${noun}`,
    );
}

/**
 * A step that read or changed files, by the parts and documents they are:
 * "Looked at the servo bracket" (its script, its model and its drawing are
 * all the bracket), "Updated the bracket drawing and 2 more". Files with no
 * engineer's name keep their file names.
 */
export function engineeringFilesLabel(verb: string, paths: ReadonlyArray<string>): string {
  const { changes, other } = designChanges(paths);
  const phrase = changesPhrase(changes, other);
  if (phrase !== null) return `${verb} ${phrase}`;
  const [first, ...rest] = paths;
  if (first === undefined) return verb;
  return rest.length === 0
    ? `${verb} ${base(first)}`
    : `${verb} ${base(first)} and ${rest.length} more`;
}
