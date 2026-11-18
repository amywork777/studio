import { isEngineeringInterface } from "../studioInterface";

// The engineering interface's words for T3's sentences, keyed on T3's text. Studio's build sends
// T3's `gt()` and `msg()` text through here (`studioGtReact.tsx`), so T3's files keep their own.
const ENGINEERING_WORDS: ReadonlyMap<string, string> = new Map([
  // The timeline (`chat/MessagesTimeline.logic.ts`, `chat/MessagesTimeline.tsx`).
  ["Superseded attempt", "Stopped to read your message"],
  ["Load earlier turns", "Show earlier messages"],
  ["Loading earlier turns…", "Showing earlier messages…"],
]);

/** T3's text in the engineering interface's words, where it has its own; else as given. */
export function engineeringWords(text: string): string {
  return isEngineeringInterface() ? (ENGINEERING_WORDS.get(text) ?? text) : text;
}
