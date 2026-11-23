import { isEngineeringInterface } from "../studioInterface";

// The engineering interface's words for T3's sentences, keyed on T3's text. Studio's build sends
// T3's `gt()` and `msg()` text through here (`studioGtReact.tsx`), so T3's files keep their own.
const ENGINEERING_WORDS: ReadonlyMap<string, string> = new Map([
  // The timeline (`chat/MessagesTimeline.logic.ts`, `chat/MessagesTimeline.tsx`).
  ["Superseded attempt", "Stopped to read your message"],
  ["Load earlier turns", "Show earlier messages"],
  ["Loading earlier turns…", "Showing earlier messages…"],
  // The composer (`chat/ChatComposer.tsx`) and its "/" menu (`chat/useComposerMenuItems.ts`).
  ["Enable a provider in Settings", "Sign in to an AI agent in Settings"],
  [
    "Enable a provider in Settings to send a message",
    "Sign in to an AI agent in Settings to send a message",
  ],
  ["Choose a project above to start a thread", "Choose a project to start a chat"],
  ["Switch response model for this thread", "Switch the model for this chat"],
  // Settings, the sidebar, the command palette and keybindings name a project's chats one way (law 2).
  ["Threads", "Chats"],
]);

/** T3's text in the engineering interface's words, where it has its own; else as given. */
export function engineeringWords(text: string): string {
  return isEngineeringInterface() ? (ENGINEERING_WORDS.get(text) ?? text) : text;
}
