import { appName } from "@t3tools/shared/appName";

// Studio's build sends T3's `gt()`, `msg()` and `<T>` text through here (`apps/web/vite/brand.ts`),
// so T3's files keep saying "T3 Code" and Studio shows its own name. English is all Studio ships.

// Copy naming T3's own product or machinery (its relay, phone app, GNOME extension) stays T3 Code.
const KEPT_PARTS: ReadonlyArray<string> = [
  "T3 Code GNOME extension",
  "Enable T3 Code SnapShots",
  "Check T3 Code SnapShots",
  "Enjoying T3 Code?",
  "It really helps T3 Code grow.",
  "Start T3 Code there first.",
  "restart T3 Code there.",
  "T3 Code server to browse issues.",
  "It opens in T3 Code if you're connected",
  "Get T3 Code",
  "T3 Code is preparing this environment",
  "T3 Code needs the relay client",
  "Keep T3 Code open while the relay client",
  "T3 Code will download and install version",
  "Install T3 Code on your phone",
  "Use T3 Code on your phone",
  "T3 Code app for iPhone and Android",
  "cannot install the relay client automatically",
  "Start T3 Code on that computer",
  "Themes restyle T3 Code",
  "the stock T3 Code theme",
];
const KEPT_WHOLE: ReadonlySet<string> = new Set([
  "Update T3 Code on {environment}",
  "Restart T3 Code on ",
]);

// Studio's wording for a few of T3's sentences, keyed on T3's text.
const REWORDED: ReadonlyArray<readonly [string, (name: string) => string]> = [
  ["T3 Connect is not available in this build.", () => "Other apps cannot connect in this build."],
  ["T3 requests zero data retention", (name) => `${name} requests zero data retention`],
  ["Restart the T3 server on {label}", (name) => `Restart the ${name} server on {label}`],
  ["the T3 home folder", (name) => `the ${name} home folder`],
  ["conversations as T3 threads", (name) => `conversations as ${name} threads`],
  ["Use T3 desktop for", (name) => `Use ${name} desktop for`],
  ["not a child of the T3 Server", (name) => `not a child of the ${name} server`],
  ["for the T3 server root process", (name) => `for the ${name} server root process`],
  ["known T3 operations", (name) => `known ${name} operations`],
  ["T3 system footprint", (name) => `${name} system footprint`],
];
const REWORDED_WHOLE: ReadonlyMap<string, (name: string) => string> = new Map([
  ["T3 process", (name: string) => `${name} process`],
]);

const T3_NAME = "T3 Code";

export function namesT3(text: string): boolean {
  return text.includes("T3");
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
  if (!out.includes(T3_NAME) || KEPT_WHOLE.has(out)) return out;
  if (KEPT_PARTS.some((kept) => out.includes(kept))) return out;
  return out.replaceAll(T3_NAME, name);
}
