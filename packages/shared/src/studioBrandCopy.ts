import { appName } from "./appName.ts";

// Studio sends T3's English through here (the web's `gt()`, `msg()` and `<T>` via `vite/brand.ts`,
// the desktop's `m()`), so T3's files keep "T3 Code" and Studio shows its own name. T3's own
// products are hidden, not kept (`workbench/hiddenT3Features.ts`), so every "T3 Code" becomes it.

// Studio's wording for a few of T3's sentences, keyed on T3's text.
const REWORDED: ReadonlyArray<readonly [string, (name: string) => string]> = [
  ["T3 Connect is not available in this build.", () => "Other apps cannot connect in this build."],
  ["T3 requests zero data retention", (name) => `${name} requests zero data retention`],
  ["Restart the T3 server on {label}", (name) => `Restart the ${name} server on {label}`],
  ["environment's T3 server", (name) => `environment's ${name} server`],
  ["T3 home", (name) => `${name} home`],
  // The agent's own tools that start, read and message chats (`t3McpToolPresentationCopy.ts`).
  ["T3 thread", (name) => `${name} thread`],
  ["Use T3 desktop for", (name) => `Use ${name} desktop for`],
  ["not a child of the T3 Server", (name) => `not a child of the ${name} server`],
  ["for the T3 server root process", (name) => `for the ${name} server root process`],
  ["known T3 operations", (name) => `known ${name} operations`],
  ["T3 system footprint", (name) => `${name} system footprint`],
];
const REWORDED_WHOLE: ReadonlyMap<string, (name: string) => string> = new Map([
  ["T3 process", (name: string) => `${name} process`],
  // Settings, About: the welcome page's phone section is T3's phone app, which Studio leaves out.
  [
    "See your agents, import projects, and set up your phone.",
    () => "See your agents and import projects.",
  ],
]);

const T3_NAME = "T3 Code";

/** Whether Studio changes this text: it names T3, or it is one of the sentences reworded whole. */
export function namesT3(text: string): boolean {
  return text.includes("T3") || REWORDED_WHOLE.has(text);
}

/** T3's English source text with Studio's name in it. */
export function brandCopy(text: string): string {
  if (!namesT3(text)) return text;
  const name = appName();
  if (name === T3_NAME) return text;
  const whole = REWORDED_WHOLE.get(text);
  if (whole !== undefined) return whole(name);
  let out = text;
  for (const [from, to] of REWORDED) {
    if (out.includes(from)) out = out.replaceAll(from, to(name));
  }
  return out.replaceAll(T3_NAME, name);
}
