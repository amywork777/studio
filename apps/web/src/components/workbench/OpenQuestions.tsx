import type { EnvironmentId } from "@t3tools/contracts";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { useProjectFileQuery } from "../files/projectFilesQueryState";
import { Button } from "../ui/button";
import { handToChat } from "./handToChat";
import { questionAnswer, readmeSections, unansweredQuestions } from "./projectReadme";
import { MODULE_HEADING, SECTION_STACK } from "./studioLayout";

/**
 * The README's open questions (`## Open questions`, `readmeSections`), each its answers as taps,
 * the one the part was built with first: a tap answers in the chat, as the person would, and the
 * agent settles it; Other writes the question into the chat for words of their own. Nothing shows
 * while there is no question.
 */
export function OpenQuestions(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly mutationId: string | null;
  readonly composerRef: ComposerHandleRef | null;
  /** Brings the chat into view, where the answer goes. */
  readonly onShowChat: () => void;
  /** The project's setup: a question it answers is not asked. */
  readonly setup: { readonly process: string; readonly material: string } | null;
}) {
  const { environmentId, cwd, mutationId, composerRef, onShowChat, setup } = props;
  const readme = useProjectFileQuery(environmentId, cwd, "README.md");
  useWorkspaceMutationRefresh({
    mutationId,
    refresh: readme.refresh,
    resourceKey: `studio-readme-questions:${cwd}`,
  });
  const contents = readme.data == null || readme.data.truncated ? null : readme.data.contents;
  const questions = unansweredQuestions(readmeSections(contents).questions, setup);
  if (questions.length === 0 || composerRef === null) return null;
  const answer = (text: string) => {
    onShowChat();
    handToChat(composerRef, text);
  };
  const other = (question: (typeof questions)[number]) => {
    const composer = composerRef.current;
    if (composer === null) return;
    onShowChat();
    composer.insertTextAtEnd(`About the open question "${question.text}": `, {
      ensureLeadingBoundary: true,
    });
    composer.focusAtEnd();
  };
  return (
    <section aria-label="Questions" className={SECTION_STACK}>
      <h2 className={MODULE_HEADING}>
        Questions
        <span className="tabular-nums text-muted-foreground">{questions.length}</span>
      </h2>
      <ul className="flex flex-col border-t border-border">
        {questions.map((question) => (
          <li
            key={question.text}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border py-2"
          >
            <p className="min-w-0 flex-1 text-sm text-foreground">{question.text}</p>
            <div className="flex flex-wrap gap-2">
              {question.answers.map((choice, index) => (
                <Button
                  key={choice}
                  size="sm"
                  variant={index === 0 ? "outline" : "ghost-muted"}
                  onClick={() => answer(questionAnswer(question, choice))}
                >
                  {index === 0 ? `Keep ${choice}` : choice}
                </Button>
              ))}
              <Button size="sm" variant="ghost-muted" onClick={() => other(question)}>
                {question.answers.length === 0 ? "Answer" : "Other"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
