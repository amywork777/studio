// @effect-diagnostics nodeBuiltinImport:off -- a skill is a folder of files, read and written synchronously like the plugin store's
/**
 * The person's own skills: a plugin folder in Studio's state, `skills/<name>/SKILL.md` as any
 * plugin's are, so every provider takes them as it takes an installed plugin's. A plugin's own
 * skills are replaced when it updates, so editing one means a copy here (`copySkill`), and the
 * plugin's stays as it shipped.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { MY_SKILLS_PLUGIN_ID } from "@t3tools/contracts";
import { Document, parseDocument } from "yaml";

const SKILL_FILE = "SKILL.md";
/** Where a skill keeps its title as typed (`skillDetails` reads it); never shown as one of its files. */
const FACE_FILE = NodePath.join("agents", "openai.yaml");
const MAX_LISTED_FILES = 200;
const MAX_READ_BYTES = 1024 * 1024;

/** The folder a skills folder holds a skill in, or null for a name that would leave it. */
export function skillFolderIn(skillsDir: string, name: string): string | null {
  if (name === "" || name === "." || name === ".." || /[/\\]/.test(name)) return null;
  return NodePath.join(skillsDir, name);
}

/** Makes the plugin's folder, with the manifest that makes it a plugin. */
export function ensureMySkills(root: string): void {
  const manifest = NodePath.join(root, ".claude-plugin", "plugin.json");
  NodeFS.mkdirSync(NodePath.join(root, "skills"), { recursive: true });
  if (NodeFS.existsSync(manifest)) return;
  NodeFS.mkdirSync(NodePath.dirname(manifest), { recursive: true });
  NodeFS.writeFileSync(
    manifest,
    `${JSON.stringify(
      {
        name: MY_SKILLS_PLUGIN_ID,
        version: "1.0.0",
        description: "The skills you added or copied in Studio's Toolbox.",
      },
      null,
      2,
    )}\n`,
  );
}

/** A title as a skill's name: lower case words joined by dashes; "skill" when none are left. */
export function skillSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return slug === "" ? "skill" : slug;
}

/** `wanted`, or `wanted-2` and on, the first no skill in the folder has. */
function freeName(skillsDir: string, wanted: string): string {
  let name = wanted;
  for (let at = 2; NodeFS.existsSync(NodePath.join(skillsDir, name)); at += 1) {
    name = `${wanted}-${at}`;
  }
  return name;
}

/** A new skill's file: what a skill needs to be found, and where its steps go. */
function newSkillText(name: string, title: string, description: string): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `# ${title}`,
    "",
    "Write what the agent should do, step by step.",
    "",
  ].join("\n");
}

/** A YAML file's document, or an empty map's where it is missing or does not parse. */
function yamlDocument(text: string): Document {
  const document = parseDocument(text);
  return document.errors.length > 0 || document.contents === null ? new Document({}) : document;
}

/** The front matter of a skill's file, as a document that keeps its order and comments. */
function skillHeader(text: string): Document {
  return yamlDocument(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "");
}

/** What a skill's file says it is for; blank when it does not say. */
function headerDescription(text: string): string {
  const description: unknown = skillHeader(text).get("description");
  return typeof description === "string" ? description.trim() : "";
}

/**
 * Keeps a skill's title as it was typed; only a name with no title gets title-cased. A copy's face
 * may carry a short description, which the list prefers, so a changed `description` replaces it.
 */
function writeSkillTitle(folder: string, title: string, description?: string): void {
  const file = NodePath.join(folder, FACE_FILE);
  const face = yamlDocument(NodeFS.existsSync(file) ? NodeFS.readFileSync(file, "utf8") : "");
  face.setIn(["interface", "display_name"], title);
  if (description !== undefined && face.hasIn(["interface", "short_description"])) {
    face.setIn(["interface", "short_description"], description);
  }
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, face.toString({ lineWidth: 0 }));
}

/** Makes a skill from a title and what it is for; answers its name. */
export function createSkill(skillsDir: string, title: string, description: string): string {
  const name = freeName(skillsDir, skillSlug(title));
  const folder = NodePath.join(skillsDir, name);
  NodeFS.mkdirSync(folder, { recursive: true });
  NodeFS.writeFileSync(NodePath.join(folder, SKILL_FILE), newSkillText(name, title, description));
  writeSkillTitle(folder, title);
  return name;
}

/** Sets the `name:` a skill's file gives itself, which an agent knows it by. */
export function renamedSkillText(text: string, name: string): string {
  return text.replace(/^(---\r?\n[\s\S]*?^)name:.*$/m, `$1name: ${name}`);
}

/** Copies a skill and all its files into `skillsDir` as the person's own; answers its name. */
export function copySkill(from: string, skillsDir: string, name: string): string {
  const copy = freeName(skillsDir, `my-${name}`);
  const to = NodePath.join(skillsDir, copy);
  NodeFS.cpSync(from, to, { recursive: true, dereference: true });
  const skillFile = NodePath.join(to, SKILL_FILE);
  NodeFS.writeFileSync(skillFile, renamedSkillText(NodeFS.readFileSync(skillFile, "utf8"), copy));
  // Named for the list as the skill it came from, so the copy has to say it is one.
  const face = NodePath.join(to, "agents", "openai.yaml");
  if (NodeFS.existsSync(face)) {
    NodeFS.writeFileSync(
      face,
      NodeFS.readFileSync(face, "utf8").replace(
        /^(\s*display_name:\s*)["']?(.*?)["']?\s*$/m,
        '$1"$2 (my copy)"',
      ),
    );
  }
  return copy;
}

/** Every file a skill holds beside its `SKILL.md` and its face, by its path in the skill's folder. */
function otherFiles(folder: string): ReadonlyArray<string> {
  const entries = NodeFS.readdirSync(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => NodePath.relative(folder, NodePath.join(entry.parentPath, entry.name)))
    .filter((file) => file !== SKILL_FILE && file !== FACE_FILE)
    .toSorted()
    .slice(0, MAX_LISTED_FILES);
}

/** A file's text; one too long to read says so rather than filling the page. */
function fileText(file: string): string {
  return NodeFS.statSync(file).size > MAX_READ_BYTES
    ? "This file is too large to show here."
    : NodeFS.readFileSync(file, "utf8");
}

/**
 * A skill's `SKILL.md`, or the file named by `file` if it is one of the skill's, with the list of
 * its other files. Null where the skill or the file is not there.
 */
export function readSkill(
  folder: string,
  file: string | null,
): {
  readonly text: string;
  readonly description: string;
  readonly files: ReadonlyArray<string>;
} | null {
  const skillFile = NodePath.join(folder, SKILL_FILE);
  if (!NodeFS.existsSync(skillFile)) return null;
  const files = otherFiles(folder);
  if (file !== null && !files.includes(file)) return null;
  return {
    text: fileText(NodePath.join(folder, file ?? SKILL_FILE)),
    description: headerDescription(fileText(skillFile)),
    files,
  };
}

/** A skill's file with what it is for and its steps replaced, the rest of its header kept. */
export function editedSkillText(
  text: string,
  name: string,
  description: string,
  instructions: string,
): string {
  const header = skillHeader(text);
  if (!header.has("name")) header.set("name", name);
  // A new node, so a value that was folded or quoted does not keep that style.
  header.set("description", header.createNode(description));
  return `---\n${header.toString({ lineWidth: 0 })}---\n\n${instructions.trim()}\n`;
}

/** Saves what the skill editor shows: a skill's title, what it is for and its steps. */
export function saveSkill(
  folder: string,
  edit: {
    readonly title: string;
    readonly description: string;
    readonly instructions: string;
  },
): void {
  const file = NodePath.join(folder, SKILL_FILE);
  const text = NodeFS.readFileSync(file, "utf8");
  NodeFS.writeFileSync(
    file,
    editedSkillText(text, NodePath.basename(folder), edit.description, edit.instructions),
  );
  writeSkillTitle(
    folder,
    edit.title,
    edit.description === headerDescription(text) ? undefined : edit.description,
  );
}

/** Takes a skill out with all its files. */
export function removeSkill(folder: string): void {
  NodeFS.rmSync(folder, { recursive: true, force: true });
}
