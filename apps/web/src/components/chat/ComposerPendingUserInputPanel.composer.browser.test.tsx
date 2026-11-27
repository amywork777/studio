import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import type { PendingUserInput } from "../../session-logic";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import { shouldTypeToFocusComposer } from "./composerFocusRedirect";

// Studio's: the composer is the question's free-text answer, so its digit keys pick an option
// only while it is empty (beside T3 Code's own cases in ComposerPendingUserInputPanel.browser.test.tsx).
const threadRef = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };

const prompt: PendingUserInput = {
  requestId: RuntimeRequestId.make("question-composer"),
  createdAt: "2026-11-27T00:00:00.000Z",
  dismissible: false,
  responseCapability: "live",
  questions: [
    {
      id: "question",
      header: "Controller",
      question: "Which controller runs the mill?",
      options: [
        { label: "GRBL", description: "Hobby mills" },
        { label: "LinuxCNC", description: "Retrofits" },
      ],
      multiSelect: false,
    },
  ],
};

it.each<{ focus: string; control: ReactNode; toggles: boolean }>([
  {
    focus: "the empty composer",
    control: <div data-testid="composer-editor" contentEditable aria-label="Focused" />,
    toggles: true,
  },
  {
    focus: "the composer holding a typed answer",
    control: (
      <div
        data-testid="composer-editor"
        contentEditable
        suppressContentEditableWarning
        aria-label="Focused"
      >
        12 mm
      </div>
    ),
    toggles: false,
  },
  { focus: "a text field", control: <input aria-label="Focused" />, toggles: false },
])(
  "digit shortcut with focus in $focus picks an option: $toggles",
  async ({ control, toggles }) => {
    const onToggleOption = vi.fn();
    await using screen = await render(
      <>
        {control}
        <ComposerPendingUserInputPanel
          pendingUserInputs={[prompt]}
          cwd={undefined}
          threadRef={threadRef}
          respondingRequestIds={[]}
          answers={{}}
          questionIndex={0}
          onToggleOption={onToggleOption}
          onAdvance={vi.fn()}
          onDismiss={vi.fn()}
        />
      </>,
    );
    await expect.element(screen.getByText("GRBL")).toBeVisible();
    screen.getByLabelText("Focused").element().focus();

    await userEvent.keyboard("1");

    expect(onToggleOption.mock.calls).toEqual(toggles ? [["question", "GRBL"]] : []);
  },
);

// A second question in a row: the first one's answer took focus off the composer, so a digit
// reaches the chat's type-to-focus (`useChatShortcuts`, a window capture listener) first.
it("digit shortcut with focus on the page picks an option before typing can take it", async () => {
  const onToggleOption = vi.fn();
  const typed: string[] = [];
  const typeToFocus = (event: KeyboardEvent) => {
    if (!shouldTypeToFocusComposer(event)) return;
    typed.push(event.key);
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener("keydown", typeToFocus, true);
  using _typeToFocus = {
    [Symbol.dispose]: () => window.removeEventListener("keydown", typeToFocus, true),
  };
  await using screen = await render(
    <ComposerPendingUserInputPanel
      pendingUserInputs={[prompt]}
      cwd={undefined}
      threadRef={threadRef}
      respondingRequestIds={[]}
      answers={{}}
      questionIndex={0}
      onToggleOption={onToggleOption}
      onAdvance={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  await expect.element(screen.getByText("GRBL")).toBeVisible();
  (document.activeElement as HTMLElement | null)?.blur();

  await userEvent.keyboard("1");

  expect(onToggleOption.mock.calls).toEqual([["question", "GRBL"]]);
  expect(typed).toEqual([]);
});
