import type { EnvironmentId, RuntimeMode, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { T, useGT } from "gt-react";
import { DraftingCompassIcon } from "lucide-react";
import { useState } from "react";

import { useStableCallback } from "../../hooks/useStableCallback";
import { useRightPanelStore } from "../../rightPanelStore";
import { ComposerAttachButton } from "../chat/ComposerAttachmentStrip";
import type { ComposerCommandItem } from "../chat/ComposerCommandMenu";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  copyIntoReferences,
  FILE_ATTACHED_REFERENCES,
  splitForReferences,
} from "./attachToReferences";
import { ENGINEERING_RUNTIME_MODES } from "./engineeringTraits";
import { partLabel } from "./partNames";
import { SketchDialog } from "./SketchDialog";
import { droppedPath } from "./studioImportBridge";
import {
  ENGINEERING_COMPOSER_PLACEHOLDER,
  ENGINEERING_FOLLOW_UP_PLACEHOLDER,
  ENGINEERING_SLASH_DESCRIPTIONS,
  isEngineeringInterface,
  useEngineeringInterface,
} from "./studioInterface";

// Studio's side of T3's composer (`chat/ChatComposer.tsx`), which calls these in one line where it
// lists its modes and menus, writes text in, attaches files, and shows its attach button.
// Copy that is only a different sentence is in `i18n/engineeringWords.ts`.

/** What Studio adds to T3's composer handle. */
export interface StudioComposerHandle {
  /** Sends what the composer holds, as its send button does (Studio's New dialog starts work). */
  submit: () => void;
  /** Studio: the Brief's Attach, which files everything in References, pictures too. */
  addReferences: (files: File[]) => void;
}

/** The engineering interface names each mode by what the agent may do. */
export function runtimeModeOptions<Option extends { readonly mode: RuntimeMode }>(
  options: ReadonlyArray<Option>,
): ReadonlyArray<Option> {
  return isEngineeringInterface()
    ? options.map((option) => ({ ...option, ...ENGINEERING_RUNTIME_MODES[option.mode] }))
    : options;
}

/**
 * Studio's menus name parts, not file names, and its "/" offers its own commands, in its words,
 * and the skills, not the agent's coding commands.
 */
export function menuItems(items: ComposerCommandItem[]): ComposerCommandItem[] {
  if (!isEngineeringInterface()) return items;
  return items.flatMap((item): ComposerCommandItem[] =>
    item.type === "provider-slash-command"
      ? []
      : item.type === "path"
        ? [{ ...item, label: partLabel(item.path) }]
        : item.type === "slash-command"
          ? [
              {
                ...item,
                description: ENGINEERING_SLASH_DESCRIPTIONS[item.command] ?? item.description,
              },
            ]
          : [item],
  );
}

/** Studio's options for text written into the composer. */
export interface StudioInsertOptions {
  /** Leave a panel filling the window as it is (a note written while working there). */
  stayHidden?: boolean;
}

/** One model a chat in the engineering interface: no side-by-side runs of several. */
export const multipleModelsEnabled = (enabled: boolean) => enabled && !isEngineeringInterface();

/** The empty composer's prompt in the engineering interface, in place of T3's coding hints. */
export const placeholder = (phase: string) =>
  isEngineeringInterface()
    ? phase === "disconnected"
      ? ENGINEERING_FOLLOW_UP_PLACEHOLDER
      : ENGINEERING_COMPOSER_PLACEHOLDER
    : null;

/**
 * A note written while working elsewhere leaves the keyboard there: the next keys are the view's,
 * and must not land inside the note.
 */
export const stayHiddenReplacement = (options?: { readonly stayHidden?: boolean }) =>
  options?.stayHidden === true ? { focusEditorAfterReplace: false } : undefined;

/**
 * Studio writes jobs into the chat from its menus, the viewer and the Overview: a panel filling the
 * window steps back, so what was written (and the work it starts) shows.
 */
export function revealChat(
  inserted: boolean,
  options: { readonly stayHidden?: boolean } | undefined,
  threadRef: ScopedThreadRef,
) {
  if (inserted && isEngineeringInterface() && options?.stayHidden !== true) {
    useRightPanelStore.getState().setMaximized(threadRef, false);
  }
}

interface SketchState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly threadId: ThreadId | null;
  readonly addComposerAttachments: (files: File[]) => Promise<boolean>;
}

/**
 * Attach and drop: in a Studio project a PRD or a data sheet goes in its References and the message
 * links to it (`attachToReferences.ts`); the rest, and everything elsewhere, is a chat attachment.
 * A question waiting takes what is attached as its answer.
 */
export function useStudioComposer(input: {
  readonly environmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly gitCwd: string | null;
  readonly pendingUserInputCount: number;
  readonly activeThreadId: ThreadId | null;
  readonly addComposerAttachments: (files: File[]) => Promise<boolean>;
  readonly insertComposerTextAtEnd: (
    text: string,
    options?: { ensureLeadingBoundary?: boolean },
  ) => boolean;
}) {
  const engineeringInterface = useEngineeringInterface();
  const gt = useGT();
  const { gitCwd, addComposerAttachments, insertComposerTextAtEnd } = input;
  const attachFiles = async (files: File[], pictures: "chat" | "references" = "chat") => {
    if (!engineeringInterface || input.pendingUserInputCount > 0 || gitCwd === null) {
      return addComposerAttachments(files);
    }
    // A remote environment's folder is not on this computer: its agent files what it is sent.
    const here = input.environmentId === input.primaryEnvironmentId;
    const { copied, filedByAgent, chat } = splitForReferences(
      files,
      (file) => (here ? droppedPath(file) : null),
      pictures,
    );
    const references = await copyIntoReferences(
      gitCwd,
      copied.map((entry) => entry.path),
    );
    for (const reference of references) {
      insertComposerTextAtEnd(`${serializeComposerFileLink(`${gitCwd}/${reference}`)} `, {
        ensureLeadingBoundary: true,
      });
    }
    if (references.length > 0) {
      toastManager.add({
        type: "success",
        title: gt("Added to References"),
        description: copied.map((entry) => entry.file.name).join(", "),
      });
    }
    // A copy that failed has said so: its files go with the message, so nothing is lost.
    const forAgent = [...filedByAgent, ...(references.length > 0 ? [] : copied.map((c) => c.file))];
    const inserted = await addComposerAttachments([...chat, ...forAgent]);
    if (forAgent.length > 0) {
      insertComposerTextAtEnd(FILE_ATTACHED_REFERENCES, { ensureLeadingBoundary: true });
    }
    return inserted || references.length > 0 || forAgent.length > 0;
  };
  const attachFilesStable = useStableCallback(attachFiles);
  const [sketchOpen, setSketchOpen] = useState(false);
  const sketch: SketchState = {
    open: sketchOpen,
    setOpen: setSketchOpen,
    threadId: input.activeThreadId,
    addComposerAttachments,
  };
  return { attachFiles: attachFilesStable, sketch };
}

/** T3's attach button, and beside it in the engineering interface, Draw a sketch. */
export function StudioAttachButton(props: {
  readonly addComposerAttachments: (files: File[]) => Promise<boolean>;
  readonly focusComposer: () => void;
  readonly sketch: SketchState;
}) {
  const engineeringInterface = useEngineeringInterface();
  const gt = useGT();
  const { sketch } = props;
  return (
    <>
      <ComposerAttachButton
        addComposerAttachments={props.addComposerAttachments}
        focusComposer={props.focusComposer}
      />
      {engineeringInterface ? (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => sketch.setOpen(true)}
                  aria-label={gt("Draw a sketch")}
                />
              }
            >
              <DraftingCompassIcon />
            </TooltipTrigger>
            <TooltipPopup>
              <T>Draw a sketch</T>
            </TooltipPopup>
          </Tooltip>
          <SketchDialog
            key={sketch.threadId}
            open={sketch.open}
            onOpenChange={sketch.setOpen}
            onAttach={(files) => void sketch.addComposerAttachments(files)}
          />
        </>
      ) : null}
    </>
  );
}
