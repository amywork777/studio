import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { BotIcon, GlobeIcon } from "lucide-react";
import { memo, type MouseEvent } from "react";

import { useOpenLink } from "~/browser/useOpenLink";
import { cn } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { toastManager } from "../../ui/toast";
import { stackedThreadToast } from "../../ui/toastHelpers";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { FileKindIcon } from "../FileKindIcon";
import { useSimpleViewStore } from "../simpleView";
import { useEngineeringInterface } from "../studioInterface";
import { useFolderPaths } from "../useFolderPaths";
import { useOpenChatFile } from "../useOpenInWorkbench";
import type { SourceTarget } from "./answerSources";
import { pressReference } from "./openReference";
import { referenceLabel, referenceOpenLabel, type AnswerReference } from "./turnReferences";

/**
 * The References under an answer, in the engineering interface: what the answer cites, or what
 * its turn opened, each with when the agent opened it (`turnReferences`). It reads as a sibling
 * of the "Changed" line (`TurnDesignChanges`), which replaces the changed-files card there: the
 * same margin and a quiet heading, with no frame of its own. Each opens where it came from.
 */

const QUIET = "text-muted-foreground";
const ROW = "flex min-w-0 items-center gap-2 py-0.5 text-xs";
// Pressed as the chat's own chips are, the "Changed" line's (`TurnDesignChanges`); its band reaches
// past the text, which stays where it was.
const PRESSABLE =
  "-mx-1 w-[calc(100%+0.5rem)] rounded-md px-1 text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/** Where the list's chat is: its thread, the thread's environment and its folder. */
interface ReferencesBeside {
  readonly threadRef: ScopedThreadRef | null;
  readonly environmentId: EnvironmentId;
  readonly root: string | undefined;
}

type ReferenceOpener = (target: SourceTarget, event: MouseEvent<HTMLElement>) => void;

/**
 * The references to list under an answer: its own, in the engineering interface, when it has some.
 * The answer's Sources block is left out of its text where this list shows.
 */
export function useShownReferences(
  references: ReadonlyArray<AnswerReference> | undefined,
): ReadonlyArray<AnswerReference> | null {
  const engineering = useEngineeringInterface();
  return engineering && references !== undefined && references.length > 0 ? references : null;
}

/**
 * Opens a reference where it came from, beside the list's chat (`pressReference`): a part by its
 * model in the thread's folder, a section by reading its document, a page as the person's link
 * setting has it. A press that fails says so in the chat's toast. Null beside no chat, where none
 * opens.
 */
function useOpenReference({
  threadRef,
  environmentId,
  root,
}: ReferencesBeside): ReferenceOpener | null {
  const openFile = useOpenChatFile(threadRef);
  // Until the folder is listed, a part's script opens as a file.
  const [listing] = useFolderPaths(environmentId, root === undefined ? [] : [root]);
  const files = listing?.paths ?? null;
  const readFile = useAtomQueryRunner(projectEnvironment.readFile, { reportFailure: false });
  const openLink = useOpenLink(threadRef);
  const open: ReferenceOpener = (target, event) => {
    if (threadRef === null) return;
    const modifiers = { metaKey: event.metaKey, ctrlKey: event.ctrlKey };
    const read = async (relativePath: string) => {
      if (root === undefined) return null;
      const result = await readFile({ environmentId, input: { cwd: root, relativePath } });
      return result._tag === "Success" ? result.value.contents : null;
    };
    void pressReference(target, {
      root: root ?? null,
      files,
      read,
      openFile,
      openLink: (url) => openLink(url, { event: modifiers }),
      threadKey: scopedThreadKey(threadRef),
      simpleView: useSimpleViewStore.getState().on,
      failed: (title, cause) =>
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title,
            description: cause instanceof Error ? cause.message : "An error occurred.",
          }),
        ),
    });
  };
  return threadRef === null ? null : open;
}

/** A file wears its kind's icon, as the panel's tabs do; a page the chat's icon for links. */
function ReferenceIcon(props: { readonly target: AnswerReference["target"] }) {
  const { target } = props;
  if (target.kind === "file") return <FileKindIcon path={target.path} className="size-3.5" />;
  const Icon = target.kind === "url" ? GlobeIcon : BotIcon;
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", QUIET)} />;
}

/**
 * One reference: its number, its icon, its name, where in it, and when it was opened. The row is
 * one element, with its text in full on hover while it truncates: a button that opens it, on a
 * press, Enter or Space, but for the agent's own knowledge, which opens nothing.
 */
function ReferenceRow(props: {
  readonly reference: AnswerReference;
  readonly onOpen: ReferenceOpener | null;
}) {
  const { reference, onOpen } = props;
  const engineering = useEngineeringInterface();
  const label = referenceLabel(reference);
  const { name } = label;
  // In the engineering interface a row names what it cites, not a script's line numbers.
  const where =
    engineering && reference.target.kind === "file" && reference.target.lines !== null
      ? null
      : label.where;
  const said = where === null ? name : `${name}, ${where}`;
  // What the agent did not open, or knew without opening, reads quieter. It is not a failure.
  const quiet = reference.opened === "not opened" || reference.opened === "own knowledge";
  // Whether the agent opened it is the agent's bookkeeping; the engineering interface leaves it out.
  const opened = engineering ? null : reference.opened;
  const body = (
    <>
      <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">
        {reference.n}
      </span>
      <ReferenceIcon target={reference.target} />
      <span className="min-w-0 truncate text-foreground">{name}</span>
      {where === null ? null : (
        <span className="min-w-0 truncate text-muted-foreground">{where}</span>
      )}
      {opened === null ? null : (
        <span className={cn("ms-auto shrink-0 ps-2", quiet ? QUIET : "text-foreground")}>
          {opened}
        </span>
      )}
    </>
  );
  const row =
    onOpen === null || reference.target.kind === "own" ? (
      <div className={ROW}>{body}</div>
    ) : (
      <button
        type="button"
        aria-label={referenceOpenLabel(reference)}
        onClick={(event) => onOpen(reference.target, event)}
        className={cn(ROW, PRESSABLE)}
      >
        {body}
      </button>
    );
  return (
    <li className="min-w-0">
      <Tooltip>
        <TooltipTrigger render={row} />
        <TooltipPopup side="top">{said}</TooltipPopup>
      </Tooltip>
    </li>
  );
}

function ReferenceList(
  props: ReferencesBeside & { readonly references: ReadonlyArray<AnswerReference> },
) {
  const open = useOpenReference(props);
  return (
    <section aria-label="References" className="mt-3 flex min-w-0 flex-col gap-1">
      <h3 className="text-xs text-muted-foreground">References</h3>
      <ol className="flex min-w-0 flex-col">
        {props.references.map((reference) => (
          <ReferenceRow key={reference.n} reference={reference} onOpen={open} />
        ))}
      </ol>
    </section>
  );
}

export const AnswerReferences = memo(function AnswerReferences(
  props: ReferencesBeside & { readonly references: ReadonlyArray<AnswerReference> | null },
) {
  const { references } = props;
  if (references === null) return null;
  return (
    <ReferenceList
      references={references}
      threadRef={props.threadRef}
      environmentId={props.environmentId}
      root={props.root}
    />
  );
});
