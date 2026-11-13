import {
  MessageId,
  RunId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { deriveTimelineEntriesFromVisibleTurnItems, type TimelineEntry } from "~/session-logic";
import {
  computeStableMessagesTimelineRows,
  deriveMessagesTimelineRows,
} from "../../chat/MessagesTimeline.logic";
import {
  openedInChat,
  referenceLabel,
  referenceOpenLabel,
  turnReferences,
  type AnswerReference,
} from "./turnReferences";

// References show only in the engineering interface, which the timeline's logic asks about.
const interfaceIs = vi.hoisted(() => ({ engineering: true }));
vi.mock("../studioInterface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../studioInterface")>()),
  isEngineeringInterface: () => interfaceIs.engineering,
}));
afterEach(() => {
  interfaceIs.engineering = true;
});

const run1 = RunId.make("run-1");
const run2 = RunId.make("run-2");
const run3 = RunId.make("run-3");
const threadId = ThreadId.make("thread-1");
const ROOT = "/work/rover-cad";

/**
 * A chat's turn items as the server projects them, a second apart. `timeline` reads them as the
 * web does, so the entries are the ones a thread has: a work entry's lifecycle status, its viewed
 * image, its command.
 */
function makeChat() {
  let count = 0;
  const base = (runId: RunId | null) => {
    count += 1;
    const at = DateTime.makeUnsafe(new Date(Date.UTC(2026, 9, 24, 9, 0, count)).toISOString());
    return {
      id: TurnItemId.make(`item-${count}`),
      threadId,
      runId,
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal: count,
      status: "completed" as const,
      title: null,
      startedAt: at,
      completedAt: at,
      updatedAt: at,
    };
  };
  return {
    user: (runId: RunId | null, text = "A question"): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "user_message",
      messageId: MessageId.make(`user-${count}`),
      text,
      attachments: [],
      inputIntent: "turn_start",
      createdBy: "user",
      creationSource: "web",
    }),
    assistant: (runId: RunId | null, text: string, streaming = false): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "assistant_message",
      messageId: MessageId.make(`assistant-${count}`),
      text,
      streaming,
      ...(streaming ? { status: "running" as const, completedAt: null } : {}),
    }),
    /** Claude's Read. */
    read: (
      runId: RunId | null,
      path: string,
      range: { offset?: number; limit?: number } = {},
    ): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "dynamic_tool",
      toolName: "Read",
      input: { file_path: path, ...range },
    }),
    /** Any other tool, as its provider names it. */
    tool: (
      runId: RunId | null,
      toolName: string | null,
      input: unknown,
      extra: { viewedImagePath?: string } = {},
    ): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "dynamic_tool",
      toolName,
      input,
      ...extra,
    }),
    /** The text-to-cad plugin's viewer tools, as Claude names them. */
    cad: (
      runId: RunId | null,
      tool: "cad_open" | "cad_show",
      path: string,
    ): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "dynamic_tool",
      toolName: `mcp__t3-code__text-to-cad__${tool}`,
      input: { path },
    }),
    /** Codex reads files through the shell. */
    shell: (
      runId: RunId | null,
      command: string,
      extra: { exitCode?: number; outputIndicatesFailure?: boolean } = {},
    ): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "command_execution",
      input: command,
      ...extra,
    }),
    /** Claude's WebFetch: the page is the pattern, and the result its text. */
    fetch: (runId: RunId | null, url: string): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "web_search",
      patterns: [url],
      results: [{ url, snippet: "The page's text" }],
    }),
    /** A web search: its patterns are search words, its results the hits. */
    search: (
      runId: RunId | null,
      patterns: ReadonlyArray<string>,
      results: ReadonlyArray<{ title?: string; url?: string }> = [],
    ): OrchestrationV2TurnItem => ({ ...base(runId), type: "web_search", patterns, results }),
    /** A file search: it lists the files that match, or for some agents the path it searched. */
    files: (
      runId: RunId | null,
      results: ReadonlyArray<{ fileName: string; line?: number }>,
    ): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "file_search",
      pattern: "bracket",
      results,
    }),
    reasoning: (runId: RunId | null, text: string): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "reasoning",
      text,
      streaming: false,
    }),
    edit: (runId: RunId | null, fileName: string): OrchestrationV2TurnItem => ({
      ...base(runId),
      type: "file_change",
      fileName,
    }),
  };
}

const timeline = (items: ReadonlyArray<OrchestrationV2TurnItem>): TimelineEntry[] =>
  deriveTimelineEntriesFromVisibleTurnItems({
    visibleTurnItems: items.map((item, position) => ({
      position,
      visibility: "local",
      sourceThreadId: threadId,
      sourceItemId: item.id,
      item,
    })),
    optimisticMessages: [],
  });

const withStatus = (
  item: OrchestrationV2TurnItem,
  status: OrchestrationV2TurnItem["status"],
): OrchestrationV2TurnItem => ({ ...item, status });

const file = (
  path: string,
  lines: [number, number] | null = null,
  heading: string | null = null,
) => ({ kind: "file" as const, path, lines, heading });
const page = (url: string) => ({ kind: "url" as const, url });

describe("turnReferences", () => {
  it("lists what the agent cited, each with when it was opened", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.assistant(run1, "It is in the brief."),
      chat.user(run2),
      chat.read(run2, "/work/rover-cad/parts/bracket.py", { offset: 12, limit: 7 }),
    ]);
    const answer = [
      "The holes are 3.4 mm [1], sized for the M3 screws the brief names [2].",
      "",
      "Sources:",
      "[1] parts/bracket.py:12-18",
      "[2] docs/prd.md#Fits",
    ].join("\n");
    expect(turnReferences({ answer, runId: run2, entries })).toEqual([
      { n: 1, target: file("parts/bracket.py", [12, 18]), opened: "this turn" },
      { n: 2, target: file("docs/prd.md", null, "Fits"), opened: "earlier in this chat" },
    ]);
  });

  it("marks a citation nothing opened", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/parts/bracket.py"),
      // Ends in the cited name, but not at a folder boundary.
      chat.read(run1, "/work/rover-cad/old-docs/prd.md"),
      chat.fetch(run1, "https://example.com/spec"),
    ]);
    const answer = [
      "Sources:",
      "[1] parts/other.py:3",
      "[2] docs/prd.md",
      "[3] https://example.com/other",
      "[4] parts/bracket.py:1-2",
    ].join("\n");
    expect(turnReferences({ answer, runId: run1, entries })).toEqual([
      { n: 1, target: file("parts/other.py", [3, 3]), opened: "not opened" },
      { n: 2, target: file("docs/prd.md"), opened: "not opened" },
      { n: 3, target: page("https://example.com/other"), opened: "not opened" },
      // The lines it cites do not decide whether the file was opened.
      { n: 4, target: file("parts/bracket.py", [1, 2]), opened: "this turn" },
    ]);
  });

  it("marks a file the agent only searched as not opened", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.files(run1, [
        { fileName: "docs/prd.md", line: 4 },
        { fileName: "/work/rover-cad/parts/bracket.py" },
      ]),
      chat.assistant(run1, "Found them."),
      chat.user(run2),
      chat.read(run2, "/work/rover-cad/docs/spec.md"),
    ]);
    const answer = [
      "Sources:",
      "[1] docs/prd.md#Fits",
      "[2] parts/bracket.py:12-18",
      "[3] docs/spec.md",
    ].join("\n");
    // A search in the earlier turn listed the first two and nothing read them, so they are not
    // "earlier in this chat" either.
    expect(turnReferences({ answer, runId: run2, entries })).toEqual([
      { n: 1, target: file("docs/prd.md", null, "Fits"), opened: "not opened" },
      { n: 2, target: file("parts/bracket.py", [12, 18]), opened: "not opened" },
      { n: 3, target: file("docs/spec.md"), opened: "this turn" },
    ]);
    // And in the turn that searched.
    expect(
      turnReferences({ answer: "Sources:\n[1] docs/prd.md", runId: run1, entries })[0]?.opened,
    ).toBe("not opened");
  });

  it("labels own knowledge", () => {
    const answer = "Sources:\n[1] own knowledge: ISO 2768 general tolerances\n[2] OWN KNOWLEDGE";
    expect(turnReferences({ answer, runId: run1, entries: [] })).toEqual([
      {
        n: 1,
        target: { kind: "own", text: "ISO 2768 general tolerances" },
        opened: "own knowledge",
      },
      { n: 2, target: { kind: "own", text: "" }, opened: "own knowledge" },
    ]);
  });

  it("falls back to this turn's openings without a block", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/earlier.md"),
      chat.assistant(run1, "Done."),
      chat.user(run2),
      chat.read(run2, "/work/rover-cad/docs/prd.md"),
      // The agent's own skill and tool docs are not in the project's folder.
      chat.read(run2, "/Users/amy/.claude/skills/cad/SKILL.md"),
      chat.cad(run2, "cad_show", "/work/rover-cad/parts/bracket.step"),
      chat.read(run2, "/work/rover-cad/docs/prd.md", { offset: 5, limit: 4 }),
      chat.fetch(run2, "https://example.com/spec#section"),
      chat.search(
        run2,
        ["torx screw drive"],
        [
          { title: "Torx drive", url: "https://example.org/torx" },
          { title: "Another hit", url: "https://example.org/other" },
        ],
      ),
      chat.fetch(run2, "https://example.org/torx"),
      chat.read(run3, "/work/rover-cad/docs/later.md"),
    ]);
    expect(
      turnReferences({ answer: "The bracket is 3 mm thick.", runId: run2, entries, root: ROOT }),
    ).toEqual([
      { n: 1, target: file("/work/rover-cad/docs/prd.md"), opened: "this turn" },
      { n: 2, target: file("/work/rover-cad/parts/bracket.step"), opened: "this turn" },
      { n: 3, target: page("https://example.com/spec#section"), opened: "this turn" },
      {
        n: 4,
        target: page("https://example.org/torx"),
        opened: "this turn",
        title: "Torx drive",
      },
    ]);
  });

  it("does not list the files a search turned up for an answer without a block", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.files(run1, [
        { fileName: "/work/rover-cad/docs/prd.md", line: 4 },
        { fileName: "/work/rover-cad/parts/bracket.py" },
      ]),
      chat.read(run1, "/work/rover-cad/docs/spec.md"),
    ]);
    expect(turnReferences({ answer: "Done.", runId: run1, entries, root: ROOT })).toEqual([
      { n: 1, target: file("/work/rover-cad/docs/spec.md"), opened: "this turn" },
    ]);
  });

  it("lists nothing for an answer that cites nothing and whose turn opened nothing", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.shell(run1, "python parts/bracket.py"),
      chat.assistant(run1, "Built."),
    ]);
    expect(turnReferences({ answer: "Built.", runId: run1, entries, root: ROOT })).toEqual([]);
  });

  it("does not drop a cited source for being outside the project", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/Users/amy/.claude/skills/cad/SKILL.md"),
    ]);
    const answer = "Sources:\n[1] /Users/amy/.claude/skills/cad/SKILL.md";
    expect(turnReferences({ answer, runId: run1, entries, root: ROOT })).toEqual([
      { n: 1, target: file("/Users/amy/.claude/skills/cad/SKILL.md"), opened: "this turn" },
    ]);
  });

  describe("without a block, the project's own work in the thread's folder", () => {
    const listed = (items: ReadonlyArray<OrchestrationV2TurnItem>, root: string | null) =>
      turnReferences({
        answer: "Done.",
        runId: run1,
        entries: timeline(items),
        root,
      }).map((reference) => reference.target);

    it("counts a Claude Read under a worktree, whatever hidden folder the worktree sits in", () => {
      const chat = makeChat();
      const worktree = "/Users/a/.t3/worktrees/x";
      expect(
        listed([chat.user(run1), chat.read(run1, `${worktree}/parts/bracket.py`)], worktree),
      ).toEqual([file("/Users/a/.t3/worktrees/x/parts/bracket.py")]);
    });

    it("counts a Windows path in a Windows folder", () => {
      const chat = makeChat();
      expect(
        listed(
          [chat.user(run1), chat.read(run1, "C:\\work\\rover\\parts\\bracket.py")],
          "C:\\work\\rover",
        ),
      ).toEqual([file("C:\\work\\rover\\parts\\bracket.py")]);
    });

    it("leaves out files outside the folder, and the folder's own tooling", () => {
      const chat = makeChat();
      expect(
        listed(
          [
            chat.user(run1),
            chat.read(run1, "/work/rover-cad/parts/bracket.py"),
            chat.read(run1, "/work/rover-cad/AGENTS.md"),
            chat.read(run1, "/work/rover-cad/.venv/lib/readme.md"),
            chat.read(run1, "/work/rover-cad/node_modules/x/README.md"),
            chat.read(run1, "/work/rover-cad-old/docs/prd.md"),
            chat.read(run1, "/Users/a/notes/ideas.md"),
            chat.read(run1, "/Users/a/.claude/skills/cad/SKILL.md"),
            chat.shell(run1, "cat docs/prd.md"),
            chat.shell(run1, "cat ./docs/spec.md"),
            chat.shell(run1, "cat ../outside.md"),
            chat.shell(run1, "cat .git/config"),
            chat.shell(run1, "cat ~/notes/ideas.md"),
          ],
          ROOT,
        ),
      ).toEqual([
        file("/work/rover-cad/parts/bracket.py"),
        file("docs/prd.md"),
        file("./docs/spec.md"),
      ]);
    });

    it("needs the folder to place an absolute path, not a relative one", () => {
      const chat = makeChat();
      const items = [
        chat.user(run1),
        chat.read(run1, "/work/rover-cad/parts/bracket.py"),
        chat.shell(run1, "cat docs/prd.md"),
      ];
      expect(listed(items, null)).toEqual([file("docs/prd.md")]);
      expect(listed(items, ROOT)).toEqual([
        file("/work/rover-cad/parts/bracket.py"),
        file("docs/prd.md"),
      ]);
    });

    it("lists a file opened twice, by a relative and an absolute path, once", () => {
      const chat = makeChat();
      expect(
        listed(
          [
            chat.user(run1),
            chat.shell(run1, "cat parts/bracket.py"),
            chat.read(run1, "/work/rover-cad/parts/bracket.py"),
          ],
          ROOT,
        ),
      ).toEqual([file("parts/bracket.py")]);
    });
  });

  it("matches a page by its address without the fragment", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.fetch(run1, "https://Example.com/spec#intro"),
      chat.fetch(run1, "https://example.com/other/"),
    ]);
    const answer = [
      "Sources:",
      "[1] https://example.com/spec#clearance",
      "[2] https://example.com/spec?page=2",
      "[3] https://example.com/other",
      "[4] https://example.com/other/",
    ].join("\n");
    expect(turnReferences({ answer, runId: run1, entries })).toEqual([
      { n: 1, target: page("https://example.com/spec#clearance"), opened: "this turn" },
      // A different query is a different page.
      { n: 2, target: page("https://example.com/spec?page=2"), opened: "not opened" },
      { n: 3, target: page("https://example.com/other"), opened: "not opened" },
      { n: 4, target: page("https://example.com/other/"), opened: "this turn" },
    ]);
  });

  it("compares an address that does not parse as written, without the fragment", () => {
    const chat = makeChat();
    const entries = timeline([chat.user(run1), chat.fetch(run1, "http://[bad/page#one")]);
    const answer = "Sources:\n[1] http://[bad/page#two\n[2] http://[bad/other#one";
    expect(turnReferences({ answer, runId: run1, entries }).map((item) => item.opened)).toEqual([
      "this turn",
      "not opened",
    ]);
  });

  it("leaves out an answer's later runs", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.assistant(run1, "First."),
      chat.user(run2),
      chat.assistant(run2, "Second."),
      chat.user(run3),
      chat.read(run3, "/work/rover-cad/docs/prd.md"),
      chat.fetch(run3, "https://example.com/spec"),
    ]);
    const answer = "Sources:\n[1] docs/prd.md\n[2] https://example.com/spec";
    expect(turnReferences({ answer, runId: run2, entries })).toEqual([
      { n: 1, target: file("docs/prd.md"), opened: "not opened" },
      { n: 2, target: page("https://example.com/spec"), opened: "not opened" },
    ]);
    // Run 3's own answer sees them as this turn's.
    expect(turnReferences({ answer, runId: run3, entries }).map((item) => item.opened)).toEqual([
      "this turn",
      "this turn",
    ]);
    // Run 1's answer does not see what run 3 opened either.
    expect(turnReferences({ answer: "Sources:\n[1] docs/prd.md", runId: run1, entries })).toEqual([
      { n: 1, target: file("docs/prd.md"), opened: "not opened" },
    ]);
  });

  it("matches a cited relative path to an absolute Read", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/parts/bracket.py"),
      chat.read(run1, "C:\\work\\rover-cad\\docs\\prd.md"),
      chat.shell(run1, "cat docs/notes.md"),
    ]);
    const answer = [
      "Sources:",
      "[1] parts/bracket.py:12-18",
      "[2] ./parts/bracket.py",
      "[3] docs/prd.md#Fits",
      "[4] /work/rover-cad/docs/notes.md",
      "[5] bracket.py",
    ].join("\n");
    expect(turnReferences({ answer, runId: run1, entries })).toEqual([
      // The relative citation, and the line range it carries, of the absolute Read.
      { n: 1, target: file("parts/bracket.py", [12, 18]), opened: "this turn" },
      // The same, written from the folder with ./.
      { n: 2, target: file("./parts/bracket.py"), opened: "this turn" },
      // A Windows Read, cited by its heading.
      { n: 3, target: file("docs/prd.md", null, "Fits"), opened: "this turn" },
      // A relative Read, cited by its absolute path.
      { n: 4, target: file("/work/rover-cad/docs/notes.md"), opened: "this turn" },
      // A bare file name ends a path at a folder.
      { n: 5, target: file("bracket.py"), opened: "this turn" },
    ]);
  });

  describe("a web search", () => {
    const hits = [
      { title: "Torx drive", url: "https://EXAMPLE.org/torx" },
      { title: "Another hit", url: "https://example.org/other" },
    ];

    it("does not open the pages it lists, and gives a page the agent fetched its title", () => {
      const chat = makeChat();
      const entries = timeline([
        chat.user(run1),
        chat.search(run1, ["torx screw drive"], hits),
        chat.fetch(run1, "https://example.org/torx#top"),
      ]);
      const answer = "Sources:\n[1] https://example.org/torx\n[2] https://example.org/other";
      expect(turnReferences({ answer, runId: run1, entries })).toEqual([
        {
          n: 1,
          target: page("https://example.org/torx"),
          opened: "this turn",
          title: "Torx drive",
        },
        // A hit the agent never fetched, with the title the search gave it left unsaid.
        { n: 2, target: page("https://example.org/other"), opened: "not opened" },
      ]);
    });

    it("lists only the pages fetched, not every hit, for an answer without a block", () => {
      const chat = makeChat();
      const entries = timeline([
        chat.user(run1),
        chat.search(run1, ["torx screw drive"], hits),
        chat.search(run1, ["torx", "drive size"], [{ url: "https://example.org/third" }]),
        chat.fetch(run1, "https://example.org/torx#top"),
      ]);
      expect(turnReferences({ answer: "Use a T10.", runId: run1, entries, root: ROOT })).toEqual([
        {
          n: 1,
          target: page("https://example.org/torx#top"),
          opened: "this turn",
          title: "Torx drive",
        },
      ]);
    });
  });

  it("prefers this turn to an earlier opening", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.user(run2),
      chat.read(run2, "/work/rover-cad/docs/prd.md"),
    ]);
    expect(
      turnReferences({ answer: "Sources:\n[1] docs/prd.md", runId: run2, entries })[0]?.opened,
    ).toBe("this turn");
  });

  it("gives an answer with no run no list, whatever the chat opened later", () => {
    const chat = makeChat();
    const answer = "It is in the brief.\n\nSources:\n[1] docs/prd.md\n[2] parts/a.py";
    const entries = timeline([
      chat.user(null),
      chat.assistant(null, answer),
      chat.read(null, "/work/rover-cad/docs/prd.md"),
      chat.user(run2),
      chat.read(run2, "/work/rover-cad/parts/a.py"),
    ]);
    expect(turnReferences({ answer, runId: null, entries, root: ROOT })).toEqual([]);
    expect(turnReferences({ answer: "Done.", runId: null, entries, root: ROOT })).toEqual([]);
  });

  it("counts a run the chat does not hold yet as after everything it has", () => {
    const chat = makeChat();
    const entries = timeline([chat.user(run1), chat.read(run1, "/work/rover-cad/docs/prd.md")]);
    expect(
      turnReferences({ answer: "Sources:\n[1] docs/prd.md", runId: run2, entries })[0]?.opened,
    ).toBe("earlier in this chat");
  });

  it("matches each answer's sources on a long chat and keeps each list", () => {
    // 200 turns, each reading two or three of 300 scripts: 500 openings. Each answer cites what its turn read, a script
    // read in an earlier turn, a document nothing opened, and a page.
    const chat = makeChat();
    const items: OrchestrationV2TurnItem[] = [];
    let opened = 0;
    for (let turn = 0; turn < 200; turn += 1) {
      const runId = RunId.make(`run-long-${turn}`);
      items.push(chat.user(runId));
      const read: string[] = [];
      for (let at = 0; at < (turn % 2 === 0 ? 3 : 2); at += 1, opened += 1) {
        read.push(`parts/part-${opened % 300}.py`);
        items.push(chat.read(runId, `/work/rover-cad/${read.at(-1)}`, { offset: 1, limit: 10 }));
      }
      const cited = [...read, `parts/part-${(opened + 150) % 300}.py`, `docs/note-${turn}.md`];
      const lines = [
        ...cited.map((path, index) => `[${index + 1}] ${path}`),
        `[6] https://example.com/${turn}`,
      ];
      items.push(chat.assistant(runId, ["It holds [1].", "", "Sources:", ...lines].join("\n")));
    }
    expect(opened).toBe(500);
    const entries = timeline(items);
    const answers = entries.flatMap((entry) =>
      entry.kind === "message" && entry.message.role === "assistant" ? [entry.message] : [],
    );
    expect(answers).toHaveLength(200);
    const listOf = (message: (typeof answers)[number]) =>
      turnReferences({
        id: message.id,
        answer: message.text,
        runId: message.runId,
        entries,
        root: ROOT,
      });
    const lists = answers.map(listOf);
    expect(lists[150]).toEqual([
      { n: 1, target: file("parts/part-75.py"), opened: "this turn" },
      { n: 2, target: file("parts/part-76.py"), opened: "this turn" },
      { n: 3, target: file("parts/part-77.py"), opened: "this turn" },
      { n: 4, target: file("parts/part-228.py"), opened: "earlier in this chat" },
      { n: 5, target: file("docs/note-150.md"), opened: "not opened" },
      { n: 6, target: page("https://example.com/150"), opened: "not opened" },
    ]);
    // The same chat asked again, as a derive pass over the same entries does: each list is the one kept, not made again.
    expect(answers.map(listOf).every((list, index) => list === lists[index])).toBe(true);
  });
});

describe("openedInChat", () => {
  const targets = (entries: ReadonlyArray<TimelineEntry>) =>
    openedInChat(entries).map((opened) => opened.target);

  it("reads a Read as the work log does, and the lines Claude's offset and limit give", () => {
    const chat = makeChat();
    const entries = timeline([
      // Claude's: the file as file_path, a part of it as offset and limit.
      chat.read(run1, "/work/rover-cad/parts/a.py", { offset: 12, limit: 7 }),
      chat.read(run1, "/work/rover-cad/parts/b.py", { offset: 12 }),
      chat.read(run1, "/work/rover-cad/parts/c.py", { limit: 7 }),
      chat.read(run1, "/work/rover-cad/parts/d.py"),
      chat.read(run1, "/work/rover-cad/parts/e.py", { offset: 0, limit: 7 }),
      // The other providers' adapters call their reads Read too, and name the file otherwise.
      chat.tool(run1, "Read", { path: "/work/rover-cad/docs/f.md", offset: 2, limit: 3 }),
      chat.tool(run1, "read", { filePath: "/work/rover-cad/docs/g.md" }),
      chat.tool(run1, "read_file", { path: "/work/rover-cad/docs/h.md" }),
    ]);
    expect(openedInChat(entries)).toEqual([
      {
        target: file("/work/rover-cad/parts/a.py", [12, 18]),
        runId: run1,
        at: entries[0]!.createdAt,
      },
      { target: file("/work/rover-cad/parts/b.py"), runId: run1, at: entries[1]!.createdAt },
      { target: file("/work/rover-cad/parts/c.py"), runId: run1, at: entries[2]!.createdAt },
      { target: file("/work/rover-cad/parts/d.py"), runId: run1, at: entries[3]!.createdAt },
      { target: file("/work/rover-cad/parts/e.py"), runId: run1, at: entries[4]!.createdAt },
      { target: file("/work/rover-cad/docs/f.md"), runId: run1, at: entries[5]!.createdAt },
      { target: file("/work/rover-cad/docs/g.md"), runId: run1, at: entries[6]!.createdAt },
      { target: file("/work/rover-cad/docs/h.md"), runId: run1, at: entries[7]!.createdAt },
    ]);
  });

  it("does not read a tool the work log does not call a read", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.tool(run1, "Glob", { path: "/work/rover-cad", pattern: "*.step" }),
      chat.tool(run1, "Grep", { path: "/work/rover-cad/docs", pattern: "M3" }),
      chat.tool(run1, "Reader", { path: "/work/rover-cad/docs/a.md" }),
      chat.tool(run1, "mcp__fs__read_file", { path: "/work/rover-cad/docs/b.md" }),
      chat.tool(run1, "Read", { limit: 3 }),
      chat.tool(run1, "Read", "docs/c.md"),
      chat.tool(run1, "Read", { file_path: "  " }),
      chat.tool(run1, null, { path: "docs/d.md" }),
      chat.tool(run1, "Read", { summary: "Large tool input", truncated: true }),
    ]);
    expect(targets(entries)).toEqual([]);
  });

  it("reads an image the agent viewed, once", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.tool(run1, "view_image", {}, { viewedImagePath: "/work/rover-cad/assets/photo.png" }),
      // Claude's Read of an image names it in the input and as the image viewed.
      chat.tool(
        run1,
        "Read",
        { file_path: "/work/rover-cad/assets/sketch.png" },
        { viewedImagePath: "/work/rover-cad/assets/sketch.png" },
      ),
      // Not an image the work log can preview: not a viewed image.
      chat.tool(run1, "view_image", {}, { viewedImagePath: "/work/rover-cad/notes.txt" }),
    ]);
    expect(targets(entries)).toEqual([
      file("/work/rover-cad/assets/photo.png"),
      file("/work/rover-cad/assets/sketch.png"),
    ]);
  });

  it("reads the CAD tools that show or open a model", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.cad(run1, "cad_open", "/work/rover-cad/parts/bracket.step"),
      chat.cad(run1, "cad_show", "/work/rover-cad/parts/servo.step"),
      chat.tool(run1, "text-to-cad.cad_show", { path: "/work/rover-cad/parts/arm.step" }),
      // The other viewer tools show what is already open.
      chat.tool(run1, "mcp__t3-code__text-to-cad__cad_screenshot", {
        path: "/work/rover-cad/parts/other.step",
      }),
      chat.tool(run1, "mcp__t3-code__text-to-cad__cad_show", {}),
    ]);
    expect(targets(entries)).toEqual([
      file("/work/rover-cad/parts/bracket.step"),
      file("/work/rover-cad/parts/servo.step"),
      file("/work/rover-cad/parts/arm.step"),
    ]);
  });

  it("does not read the files a file search listed", () => {
    const chat = makeChat();
    const entries = timeline([
      // A search lists what matches (for the ACP agents, the path it searched): nothing was read.
      chat.files(run1, [{ fileName: "docs/prd.md", line: 4 }, { fileName: "parts/a.py" }]),
      chat.files(run1, [{ fileName: "/work/rover-cad/parts" }]),
    ]);
    expect(targets(entries)).toEqual([]);
  });

  it("reads a page the agent fetched, and none a search listed", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.search(
        run1,
        ["torx screw drive"],
        [{ title: "Torx drive", url: "https://example.org/torx" }, { title: "No address" }],
      ),
      // Codex's web_search carries search words, or a page it opened.
      chat.search(run1, ["torx", "https://example.org/codex#top"]),
      chat.fetch(run1, "https://example.org/fetched"),
      chat.fetch(run1, "https://example.org/torx"),
    ]);
    expect(openedInChat(entries)).toEqual([
      { target: page("https://example.org/codex#top"), runId: run1, at: entries[1]!.createdAt },
      { target: page("https://example.org/fetched"), runId: run1, at: entries[2]!.createdAt },
      {
        target: page("https://example.org/torx"),
        runId: run1,
        at: entries[3]!.createdAt,
        title: "Torx drive",
      },
    ]);
  });

  it("reads a Codex sed read", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.shell(run1, "sed -n '12,18p' parts/bracket.py"),
      chat.shell(run1, `/bin/zsh -lc "sed -n '12,18p' parts/bracket.py"`),
    ]);
    expect(openedInChat(entries)).toEqual([
      { target: file("parts/bracket.py", [12, 18]), runId: run1, at: entries[0]!.createdAt },
      { target: file("parts/bracket.py", [12, 18]), runId: run1, at: entries[1]!.createdAt },
    ]);
  });

  it.each<[command: string, path: string, lines: [number, number] | null]>([
    ["cat docs/prd.md", "docs/prd.md", null],
    ["cat -n docs/prd.md", "docs/prd.md", null],
    ["nl -ba docs/prd.md", "docs/prd.md", null],
    ["tail docs/prd.md", "docs/prd.md", null],
    ["tail -n 20 docs/prd.md", "docs/prd.md", null],
    ["head docs/prd.md", "docs/prd.md", null],
    ["head -n 40 parts/bracket.py", "parts/bracket.py", [1, 40]],
    ["head -n40 parts/bracket.py", "parts/bracket.py", [1, 40]],
    ["head -40 parts/bracket.py", "parts/bracket.py", [1, 40]],
    ["head -c 100 parts/bracket.py", "parts/bracket.py", null],
    ["sed -n '12,18p' parts/bracket.py", "parts/bracket.py", [12, 18]],
    [`sed -n "12,18p" parts/bracket.py`, "parts/bracket.py", [12, 18]],
    ["sed -n 12,18p parts/bracket.py", "parts/bracket.py", [12, 18]],
    ["sed -n '12p' parts/bracket.py", "parts/bracket.py", [12, 12]],
    [`cat "docs/Design notes.md"`, "docs/Design notes.md", null],
    ["cat 'docs/it'\\''s.md'", "docs/it's.md", null],
    [`/bin/zsh -lc "sed -n '12,18p' parts/bracket.py"`, "parts/bracket.py", [12, 18]],
    [`zsh -c 'cat docs/prd.md'`, "docs/prd.md", null],
    [`/bin/bash -lc "head -n 5 docs/prd.md"`, "docs/prd.md", [1, 5]],
    [`sh -c "cat docs/prd.md"`, "docs/prd.md", null],
    [`/usr/bin/bash -lc 'cat "docs/Design notes.md"'`, "docs/Design notes.md", null],
  ])("reads the Codex command %j as a read of %j, lines %j", (command, path, lines) => {
    const chat = makeChat();
    const entries = timeline([chat.shell(run1, command)]);
    expect(openedInChat(entries)).toEqual([
      { target: file(path, lines), runId: run1, at: entries[0]!.createdAt },
    ]);
  });

  // `nl -ba FILE | sed -n 'A,Bp'` is how Codex quotes lines with their numbers.
  it.each<[command: string, path: string, lines: [number, number]]>([
    ["nl -ba parts/bracket.py | sed -n '12,18p'", "parts/bracket.py", [12, 18]],
    ["nl -ba parts/bracket.py|sed -n '12,18p'", "parts/bracket.py", [12, 18]],
    ["nl parts/bracket.py | sed -n 12,18p", "parts/bracket.py", [12, 18]],
    ["cat docs/prd.md | sed -n '3p'", "docs/prd.md", [3, 3]],
    [`cat -n "docs/Design notes.md" | sed -n "3,9p"`, "docs/Design notes.md", [3, 9]],
    [`/bin/zsh -lc "nl -ba parts/bracket.py | sed -n '12,18p'"`, "parts/bracket.py", [12, 18]],
  ])("reads the piped Codex command %j as a read of %j, lines %j", (command, path, lines) => {
    const chat = makeChat();
    const entries = timeline([chat.shell(run1, command)]);
    expect(openedInChat(entries)).toEqual([
      { target: file(path, lines), runId: run1, at: entries[0]!.createdAt },
    ]);
  });

  it.each([
    "cat docs/prd.md | head -n 5",
    "cat docs/prd.md|head",
    "cat docs/prd.md>out.txt",
    "cat docs/prd.md&&ls",
    "sed -n '12,18p' parts/bracket.py|cat",
    "cat docs/a.md docs/b.md",
    "cat docs/a.md > docs/b.md",
    "cat < docs/a.md",
    "cd parts && cat a.md",
    "cat a.md || cat b.md",
    "cat a.md; rm b.md",
    "cat a.md &",
    "cat *.md",
    "cat docs/?.md",
    "cat $HOME/a.md",
    "cat `which a.md`",
    "cat $(pwd)/a.md",
    "cat -",
    "cat",
    "head -n 5",
    "nl -b a docs/prd.md",
    "sed -n '12,18p;20p' a.md",
    "sed -n '18,12p' a.md",
    "sed -n '0,5p' a.md",
    "sed -n '12,18p' a.md b.md",
    "sed -i 's/a/b/' a.md",
    "sed 's/a/b/' a.md",
    "sed -n -e '12p' a.md",
    "rg bracket parts",
    "ls parts",
    "python parts/bracket.py",
    `bash -lc "bash -lc 'cat a.md'"`,
    `bash -c 'cat a.md' extra`,
    `bash -lc "cat a.md; ls"`,
    `bash -lc 'cat "unterminated.md'`,
    "cat a.md\ncat b.md",
    "cat\ndocs/prd.md",
    "",
  ])("does not read the command %j as a read", (command) => {
    const chat = makeChat();
    expect(openedInChat(timeline([chat.shell(run1, command)]))).toEqual([]);
  });

  // One pipe is allowed, and only this shape of it.
  it.each([
    "cat a.md | sed -n '1,5p' | cat",
    "nl a.md | sed -n '1,5p' | sed -n '2p'",
    "head -n 5 a.md | sed -n '1,2p'",
    "tail a.md | sed -n '1,2p'",
    "echo x | sed -n '1,2p'",
    "cat a.md b.md | sed -n '1,2p'",
    "cat a.md | sed -n '1,2p' b.md",
    "cat a.md | sed -n '2,1p'",
    "cat a.md | sed -n '0,2p'",
    "cat a.md | sed -n '1,2p;4p'",
    "cat a.md | sed -n -e '1,2p'",
    "cat a.md | sed -i 's/a/b/'",
    "cat a.md | sed '1,2p'",
    "sed -n '1,2p' a.md | cat",
    "| sed -n '1,2p'",
    "cat a.md |",
    "cat a.md || sed -n '1,2p'",
    "cat a.md | | sed -n '1,2p'",
    "cat a.md | sed -n '1,2p' > b.md",
    "cat a.md | cat | sed -n '1,2p'",
  ])("does not read the piped command %j as a read", (command) => {
    const chat = makeChat();
    expect(openedInChat(timeline([chat.shell(run1, command)]))).toEqual([]);
  });

  it("counts only a call that completed without a failure flag", () => {
    const chat = makeChat();
    const failed = (item: OrchestrationV2TurnItem) => [
      withStatus(item, "failed"),
      withStatus(item, "cancelled"),
      withStatus(item, "interrupted"),
      withStatus(item, "running"),
      withStatus(item, "pending"),
    ];
    const calls = [
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.cad(run1, "cad_show", "/work/rover-cad/parts/a.step"),
      chat.shell(run1, "cat docs/notes.md"),
      chat.shell(run1, "nl -ba docs/notes.md | sed -n '1,5p'"),
      chat.fetch(run1, "https://example.org/page"),
    ];
    expect(openedInChat(timeline(calls.flatMap(failed)))).toEqual([]);
    // A command that ran but failed says so in its exit code or its output.
    expect(
      openedInChat(
        timeline([
          chat.shell(run1, "sed -n '1,5p' missing.md", { exitCode: 2 }),
          chat.shell(run1, "cat missing.md", { outputIndicatesFailure: true }),
        ]),
      ),
    ).toEqual([]);
    expect(targets(timeline(calls))).toHaveLength(5);
  });

  it("reads only what the agent's tools report, in the order of the chat", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1, "Read docs/nothing.md"),
      chat.reasoning(run1, "cat docs/thought.md"),
      chat.edit(run1, "docs/changed.md"),
      chat.read(run1, "docs/first.md"),
      chat.assistant(run1, "I read docs/second.md"),
      chat.read(run1, "docs/second.md"),
    ]);
    expect(targets(entries)).toEqual([file("docs/first.md"), file("docs/second.md")]);
  });

  it("reads the chat once, however many answers ask", () => {
    const chat = makeChat();
    const entries = timeline([chat.user(run1), chat.read(run1, "/work/rover-cad/docs/prd.md")]);
    expect(openedInChat(entries)).toBe(openedInChat(entries));
    expect(openedInChat([...entries])).not.toBe(openedInChat(entries));
    expect(openedInChat([...entries])).toEqual(openedInChat(entries));
  });
});

describe("referenceLabel", () => {
  const reference = (target: AnswerReference["target"], title?: string): AnswerReference => ({
    n: 1,
    target,
    opened: "this turn",
    ...(title === undefined ? {} : { title }),
  });

  it("names a file as the chat's file chips do, and says where in it", () => {
    expect(referenceLabel(reference(file("parts/servo_bracket.step", [12, 18])))).toEqual({
      name: "Servo bracket",
      where: "lines 12–18",
    });
    expect(referenceLabel(reference(file("./parts/servo_bracket.step", [12, 12])))).toEqual({
      name: "Servo bracket",
      where: "line 12",
    });
    expect(referenceLabel(reference(file("docs/prd.md", null, "Scope: what we make")))).toEqual({
      name: "PRD",
      where: "Scope: what we make",
    });
    expect(referenceLabel(reference(file("parts/bracket.py", [3, 9])))).toEqual({
      name: "Bracket source",
      where: "lines 3–9",
    });
  });

  it("names a file Studio has no name for by its file name", () => {
    expect(referenceLabel(reference(file("C:\\work\\rover\\notes.cfg")))).toEqual({
      name: "notes.cfg",
      where: null,
    });
  });

  it("names a page by its title, else by its host", () => {
    expect(referenceLabel(reference(page("https://example.org/torx#a"), "Torx drive"))).toEqual({
      name: "Torx drive",
      where: "example.org",
    });
    expect(referenceLabel(reference(page("https://Example.org:8080/torx")))).toEqual({
      name: "example.org",
      where: null,
    });
    expect(referenceLabel(reference(page("http://[bad/page")))).toEqual({
      name: "http://[bad/page",
      where: null,
    });
  });

  it("names own knowledge by its words", () => {
    expect(referenceLabel(reference({ kind: "own", text: "ISO 2768" }))).toEqual({
      name: "ISO 2768",
      where: null,
    });
    expect(referenceLabel(reference({ kind: "own", text: "" }))).toEqual({
      name: "Own knowledge",
      where: null,
    });
  });

  it("names a row's press for a screen reader with what it opens, where in it, and when it was opened", () => {
    expect(referenceOpenLabel(reference(file("parts/servo_bracket.step", [12, 18])))).toBe(
      "Open Servo bracket, lines 12–18, this turn",
    );
    expect(
      referenceOpenLabel({
        ...reference(page("https://example.org/torx"), "Torx drive"),
        opened: "not opened",
      }),
    ).toBe("Open Torx drive, example.org, not opened");
    expect(
      referenceOpenLabel({ ...reference(file("docs/prd.md")), opened: "earlier in this chat" }),
    ).toBe("Open PRD, earlier in this chat");
  });
});

describe("the answer's row", () => {
  const derive = (
    timelineEntries: ReadonlyArray<TimelineEntry>,
    options: { readonly working?: boolean; readonly root?: string | undefined } = {},
  ) =>
    deriveMessagesTimelineRows({
      timelineEntries,
      isWorking: options.working ?? false,
      ...(options.working ? { runningRunId: run1 } : {}),
      workspaceRoot: "root" in options ? options.root : ROOT,
      turnDiffSummaries: [],
      supportsConversationRollback: false,
    });
  const messageRows = (rows: ReturnType<typeof derive>) =>
    rows.flatMap((row) => (row.kind === "message" ? [row] : []));

  const sources = "It is 3 mm [1].\n\nSources:\n[1] docs/prd.md#Fits";

  it("carries the references of the run's final answer, from every entry of the chat", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.assistant(run1, "Let me look at the brief."),
      chat.shell(run1, "ls docs"),
      chat.assistant(run1, sources),
      chat.user(run2),
      chat.assistant(run2, "Nothing to add."),
    ]);
    const rows = derive(entries);
    // The turn is folded: the read is not a row, but the list still has it.
    expect(rows.some((row) => row.kind === "turn-fold")).toBe(true);
    expect(rows.some((row) => row.kind === "work")).toBe(false);
    const withReferences = messageRows(rows).filter((row) => row.references !== undefined);
    expect(withReferences.map((row) => row.message.text)).toEqual([sources]);
    expect(withReferences[0]?.references).toEqual([
      { n: 1, target: file("docs/prd.md", null, "Fits"), opened: "this turn" },
    ]);
  });

  it("lists what a turn opened in the thread's folder, when its answer cites nothing", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.read(run1, "/Users/amy/.claude/skills/cad/SKILL.md"),
      chat.assistant(run1, "It is 3 mm."),
    ]);
    const answer = (rows: ReturnType<typeof derive>) => messageRows(rows).at(-1);
    expect(answer(derive(entries))?.references).toEqual([
      { n: 1, target: file("/work/rover-cad/docs/prd.md"), opened: "this turn" },
    ]);
    // Without the thread's folder an absolute path cannot be placed in it.
    expect(answer(derive(entries, { root: undefined }))?.references).toBeUndefined();
  });

  it("carries none for an answer with nothing to list", () => {
    const chat = makeChat();
    const rows = derive(timeline([chat.user(run1), chat.assistant(run1, "Hello.")]));
    expect(messageRows(rows).map((row) => row.references)).toEqual([undefined, undefined]);
  });

  it("carries none for an answer with no run, so its text stays as the agent wrote it", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(null),
      chat.assistant(null, sources),
      chat.read(null, "/work/rover-cad/docs/prd.md"),
    ]);
    expect(messageRows(derive(entries)).map((row) => row.references)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("carries none in the code interface, which never shows the list", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.assistant(run1, sources),
    ]);
    expect(messageRows(derive(entries)).at(-1)?.references).toHaveLength(1);
    interfaceIs.engineering = false;
    expect(messageRows(derive(entries)).map((row) => row.references)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("waits until the run's answer is final", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.assistant(run1, sources),
    ]);
    expect(messageRows(derive(entries, { working: true })).map((row) => row.references)).toEqual([
      undefined,
      undefined,
    ]);
    expect(messageRows(derive(entries)).at(-1)?.references).toHaveLength(1);
  });

  it("leaves a message that is still streaming alone", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.assistant(run1, sources, true),
    ]);
    expect(messageRows(derive(entries)).map((row) => row.references)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("stays with the answer when tool calls follow its text", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.assistant(run1, sources),
      // A call that failed after the text stays visible under it, with the message's footer.
      withStatus(chat.shell(run1, "python parts/bracket.py"), "failed"),
    ]);
    const rows = derive(entries);
    const answer = messageRows(rows).at(-1);
    expect(answer?.showAssistantMeta).toBe(false);
    expect(rows.some((row) => row.kind === "assistant-meta")).toBe(true);
    expect(answer?.references).toEqual([
      { n: 1, target: file("docs/prd.md", null, "Fits"), opened: "this turn" },
    ]);
  });

  it("is reused across derive passes when nothing changed", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.assistant(run1, sources),
    ]);
    const firstRows = derive(entries);
    const first = computeStableMessagesTimelineRows(firstRows, { byId: new Map(), result: [] });
    // The chat arrives as a new array of the same entries: the list is read again, as new objects.
    const secondRows = derive([...entries]);
    const second = computeStableMessagesTimelineRows(secondRows, first);
    const before = messageRows(firstRows).at(-1);
    const fresh = messageRows(secondRows).at(-1);
    expect(fresh?.references).not.toBe(before?.references);
    expect(fresh?.references).toEqual(before?.references);
    // The row it sits in is the one it had, so it does not render again.
    expect(messageRows(second.result).at(-1)).toBe(before);
    expect(second).toBe(first);
  });

  it("is replaced when the references change", () => {
    const chat = makeChat();
    const entries = timeline([
      chat.user(run1),
      chat.read(run1, "/work/rover-cad/docs/other.md"),
      chat.read(run1, "/work/rover-cad/docs/prd.md"),
      chat.assistant(run1, sources),
    ]);
    const [user, stale, read, answer] = entries;
    // The same prompt and answer, with the one file read or the other before it.
    const first = computeStableMessagesTimelineRows(derive([user!, stale!, answer!]), {
      byId: new Map(),
      result: [],
    });
    const second = computeStableMessagesTimelineRows(derive([user!, read!, answer!]), first);
    const before = messageRows(first.result).at(-1);
    const after = messageRows(second.result).at(-1);
    // Nothing else about the answer changed: only what it cites was opened.
    expect(after?.message).toBe(before?.message);
    expect(before?.references?.map((item) => item.opened)).toEqual(["not opened"]);
    expect(after?.references?.map((item) => item.opened)).toEqual(["this turn"]);
    expect(after).not.toBe(before);
  });
});
