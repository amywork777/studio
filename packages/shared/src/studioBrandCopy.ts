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
  // Settings, Worktrees and Threads: no `t3` in the example, and no file named for T3.
  [
    "For example, t3 or t3/ produces t3/add-search. Leave empty for no prefix.",
    (name: string) => {
      const prefix = name.toLowerCase().replaceAll(" ", "-");
      return `For example, ${prefix} or ${prefix}/ produces ${prefix}/add-search. Leave empty for no prefix.`;
    },
  ],
  [
    "Where new threads start. Projects and their t3.json can override it.",
    () => "Where new threads start. Each project can override it.",
  ],
  [
    "How new worktrees populate git submodules. Projects and their t3.json can override it.",
    () => "How new worktrees populate git submodules. Each project can override it.",
  ],
  // The desktop's startup errors when another server holds the data folder (`DesktopHomeOwner.ts`):
  // T3's `t3` command and pairing over SSH are not Studio's, so the way out is to quit that one.
  [
    "Another T3 Code server, such as the background service, is using this data directory, or an older background service is set up for it. Stop that server or try `t3 update`. If the older launcher cannot update, run `t3 service uninstall` and optionally reinstall with `t3 service install` from a current CLI. Use `npx t3@latest` if `t3` is missing or outdated, and pass `--base-dir` with the service's T3 home to each command. Then reopen T3 Code. You can also set a separate T3CODE_HOME and pair with the running server.",
    (name: string) =>
      `Another ${name} is using this data folder. Quit it, or end its server in Activity Monitor or Task Manager, then reopen ${name}.`,
  ],
  [
    "The T3 Code background service is using this T3 home (PID {pid}, port {port}, version {version}). Stop it with `t3 service uninstall`, passing `--base-dir` with this T3 home, and reopen T3 Code. You can also set a separate T3CODE_HOME and pair with the running server.",
    (name: string) =>
      `A ${name} background service is using this data folder (PID {pid}, port {port}, version {version}). End process {pid} in Activity Monitor or Task Manager, then reopen ${name}.`,
  ],
  [
    "The T3 Code background service is using this T3 home (PID {pid}, port {port}). Stop it with `t3 service uninstall`, passing `--base-dir` with this T3 home, and reopen T3 Code. You can also set a separate T3CODE_HOME and pair with the running server.",
    (name: string) =>
      `A ${name} background service is using this data folder (PID {pid}, port {port}). End process {pid} in Activity Monitor or Task Manager, then reopen ${name}.`,
  ],
  [
    "Another T3 Code server (for example `t3 serve`, or one started over SSH) is using this T3 home (PID {pid}, port {port}, version {version}). If a T3 Code app on another machine started it over SSH, that app restarts it: remove or disconnect that SSH environment there, or quit that app. Then stop the server, and reopen T3 Code. You can also set a separate T3CODE_HOME and pair with the running server.",
    (name: string) =>
      `Another ${name} is using this data folder (PID {pid}, port {port}, version {version}). Quit it, or end process {pid} in Activity Monitor or Task Manager, then reopen ${name}.`,
  ],
  [
    "Another T3 Code server (for example `t3 serve`, or one started over SSH) is using this T3 home (PID {pid}, port {port}). If a T3 Code app on another machine started it over SSH, that app restarts it: remove or disconnect that SSH environment there, or quit that app. Then stop the server, and reopen T3 Code. You can also set a separate T3CODE_HOME and pair with the running server.",
    (name: string) =>
      `Another ${name} is using this data folder (PID {pid}, port {port}). Quit it, or end process {pid} in Activity Monitor or Task Manager, then reopen ${name}.`,
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
