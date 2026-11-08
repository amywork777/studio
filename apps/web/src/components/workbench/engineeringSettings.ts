import { APP_BASE_NAME } from "../../branding";
import type { SettingsSearchItem, SettingsSearchItemId } from "../settings/settingsSearch";
import {
  ADVANCED_SETTINGS_SECTIONS,
  CODE_SETTINGS_SECTIONS,
  settingsSectionLabel,
} from "./studioInterface";

/**
 * Settings rows as the engineering interface shows them. A row is named by its
 * search id (`settingsSearch.ts`), which is also its element id, so one entry
 * here changes the row (`SettingsRow`) and its search result alike. The code
 * interface shows every row as written.
 */

/**
 * Rows an engineer has no use for: where threads start (checkout or worktree),
 * git, diffs and pull requests, usage-limit stops, the sidebar's coding
 * shelves, background git refreshes, the `t3` command and the legacy switches;
 * on Appearance the Dev and Nightly label, diff colors, the composer's branch
 * controls, the terminal font and word wrap (diffs and file sources); T3's
 * update track; a project's actions (its scripts and `t3.json`); and rows that do nothing in
 * Studio: project order (Home, the switcher and ⌘K always put the one opened last first) and
 * marking inactive chats done (the sidebar says when a chat was worked on, never Done).
 */
export const CODE_SETTINGS_ROWS: ReadonlySet<string> = new Set<SettingsSearchItemId>([
  "new-threads",
  "worktree-submodules",
  "start-from-origin",
  "project-grouping",
  "snooze-limited-threads",
  "working-shelf",
  "auto-settle-merged-threads",
  "hide-whitespace-changes",
  "default-diff-file-state",
  "diff-layout",
  "proactive-panels",
  "background-activity",
  "cli-command",
  "legacy-plan-mode",
  "legacy-context-window-indicator",
  "legacy-sidebar",
  "environment-identification",
  "diff-color-scheme",
  "composer-context",
  "terminal-font",
  "word-wrap",
  "update-track",
  "project-actions",
  "project-order",
  "auto-settle-inactive-threads",
  "days-before-auto-settle",
  // Studio has no pins or archive, its chats' Delete always asks, and its Import is its own.
  "unpin-confirmation",
  "archive-confirmation",
  "delete-confirmation",
  "add-project-starts-in",
  // Programmer settings. Each keeps its stored value and default; the code interfaces still show
  // them, and the Interface switch (Settings, Advanced, Interface) is the way there.
  "code-font",
  "terminal-font",
  "response-streaming",
  "composer-rich-text",
  "send-shortcut",
  "follow-up-behavior",
  "setting-glass-opacity",
  "setting-appearance-contrast",
  // Diagnostics is listed under Advanced, not as a row on General.
  "diagnostics",
]);

interface SettingCopy {
  readonly title?: string;
  readonly description?: string;
}

/** Kept rows in plain words. Only the words change: each row sets the same value. */
const ENGINEERING_SETTINGS_COPY: ReadonlyMap<string, SettingCopy> = new Map<
  SettingsSearchItemId,
  SettingCopy
>([
  [
    "continue-threads-after-server-update",
    {
      title: "Continue chats after restarts",
      description: `Pick up chats that were working when ${APP_BASE_NAME} updated, crashed or restarted.`,
    },
  ],
  [
    "text-generation-model",
    { title: "Model for short text", description: "Names chats and writes other short text." },
  ],
  ["thread-notifications", { title: "Chat notifications" }],
  [
    "provider-update-checks",
    {
      title: "Agent update checks",
      description: "Check whether a newer version of your AI agents is available.",
    },
  ],
  [
    "auto-resume-limited-threads",
    {
      title: "Resume chats after a usage limit",
      description:
        "Carry on at the reported reset time when a chat hits a usage limit. Each chat can cancel it.",
    },
  ],
  [
    "in-app-notifications",
    {
      description:
        "Show a toast when another chat finishes, fails, or needs input or approval while this app has focus.",
    },
  ],
  [
    "skills-in-slash-menu",
    {
      title: "Show skills when you type /",
      description: "Also list skills when you type / in the chat box. Typing $ always lists them.",
    },
  ],
  [
    "composer-collapse",
    {
      title: "Collapse chat box on scroll",
      description:
        "Rest the chat box on a single line when you scroll the conversation. Click it or start typing to expand it again.",
    },
  ],
  // The composer has no model picker here, so the model new chats start on is set under AI agents.
  [
    "default-model",
    {
      title: "Model",
      description:
        "The AI model new chats start on, with its Thinking and Speed. Applies to new chats and to the open chat's next turn, except a reset.",
    },
  ],
  // T3's policy is T3's; the row keeps the fact, without its link (`SettingsPanels.tsx`).
  [
    "privacy-policy",
    {
      title: "Privacy",
      description: `${APP_BASE_NAME} sends T3 Code nothing, and never sends your prompts, file names or designs.`,
    },
  ],
]);

/** What Restore defaults lists, in the rows' own words: a setting a row hides is still listed. */
const ENGINEERING_RESTORE_LABELS: ReadonlyMap<string, string> = new Map([
  ["Thread notifications", "Chat notifications"],
  ["Provider update checks", "Agent update checks"],
  ["Visible threads", "Visible chats"],
  ["Auto-settle inactive threads", "Mark inactive chats done"],
  ["Auto-settle merged threads", "Mark merged chats done"],
  ["Auto-resume limited threads", "Resume chats after a usage limit"],
  ["Snooze limited threads", "Snooze limited chats"],
  ["Composer context", "Chat box context"],
  ["Show skills in slash menu", "Show skills when you type /"],
  ["Collapse composer on scroll", "Collapse chat box on scroll"],
  ["Rich text composer", "Rich text chat box"],
  ["Continue threads after restarts", "Continue chats after restarts"],
  ["New thread mode", "New chat mode"],
  ["Text generation model", "Model for short text"],
]);

/** A label of Restore defaults' list, as the engineering interface says it. */
export function engineeringRestoreLabel(label: string, engineering: boolean): string {
  return (engineering && ENGINEERING_RESTORE_LABELS.get(label)) || label;
}

/** A row's own words in the engineering interface, or null where the row keeps its own. */
export function engineeringSettingCopy(
  id: string | undefined,
  engineering: boolean,
): SettingCopy | null {
  return (engineering && id !== undefined && ENGINEERING_SETTINGS_COPY.get(id)) || null;
}

/** Settings search in the engineering interface: only what it shows, by the names it shows. */
export function engineeringSettingsSearchItems(
  items: ReadonlyArray<SettingsSearchItem>,
): SettingsSearchItem[] {
  return items
    .map((item) =>
      // The Diagnostics row is not on General here; its search result opens the page under Advanced.
      item.id === "diagnostics"
        ? { ...item, to: "/settings/diagnostics" as const, targetId: "diagnostics-processes" }
        : // The Interface switch is a page under Advanced here, not a row of Appearance.
          item.id === "studio-interface"
          ? { ...item, to: "/settings/interface" as const }
          : // The model new chats start on is under AI agents here, not under General.
            item.id === "default-model"
            ? { ...item, to: "/settings/providers" as const }
            : item,
    )
    .filter(
      (item) =>
        !CODE_SETTINGS_SECTIONS.has(item.to) &&
        (item.id === "diagnostics" || !CODE_SETTINGS_ROWS.has(item.id)),
    )
    .map((item) => {
      const title =
        item.id === "providers"
          ? settingsSectionLabel(item.to, item.title, true)
          : ENGINEERING_SETTINGS_COPY.get(item.id)?.title;
      return title === undefined ? item : { ...item, title };
    });
}

/**
 * The settings sidebar's entries in each interface. The engineering interface lists the
 * sections it keeps, with Plugins and Diagnostics together under one Advanced group (in
 * `ADVANCED_SETTINGS_SECTIONS` order); the code interfaces list every section as before, and
 * Diagnostics stays a link on General there rather than a section of its own.
 */
export function settingsNavGroups<Entry extends { readonly to: string }>(
  entries: ReadonlyArray<Entry>,
  engineering: boolean,
): { readonly main: Entry[]; readonly advanced: Entry[] } {
  if (!engineering) {
    // Diagnostics is a link on General here, and the Interface switch a row of Appearance.
    return {
      main: entries.filter(
        (entry) => entry.to !== "/settings/diagnostics" && entry.to !== "/settings/interface",
      ),
      advanced: [],
    };
  }
  const advanced = ADVANCED_SETTINGS_SECTIONS.flatMap((to) =>
    entries.filter((entry) => entry.to === to),
  );
  const main = entries.filter(
    (entry) =>
      !CODE_SETTINGS_SECTIONS.has(entry.to) && !ADVANCED_SETTINGS_SECTIONS.includes(entry.to),
  );
  return { main, advanced };
}
