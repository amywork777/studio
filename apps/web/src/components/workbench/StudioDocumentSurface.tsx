import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { setMarkdownTaskChecked } from "@t3tools/shared/markdownTaskList";
import { type KeyboardEvent, type MouseEvent, useRef } from "react";

import { FileMarkdownPreview } from "../files/FileMarkdownPreview";
import {
  getOptimisticProjectFileQueryData,
  setProjectFileQueryData,
} from "../files/projectFilesQueryState";
import { changeFileSaveSession, useFileSaveSession } from "../files/fileSaveSessions";
import { ScrollArea } from "../ui/scroll-area";
import { type PieceKind, readPlace, withWords } from "./documentSource";

/** The piece being edited: where it is on screen and in the file, and its words before. */
interface Editing {
  readonly element: HTMLElement;
  readonly place: { readonly start: number; readonly end: number };
  readonly kind: PieceKind;
  readonly before: string;
}

const PIECE_KINDS = new Set<string>(["heading", "paragraph", "listItem", "tableCell"]);

/**
 * A document in the engineering interface (`FilePreviewPanel`), read as a document and edited where
 * it reads, as Google Docs is: a click in a heading, a paragraph, a list item or a table cell puts
 * the cursor there to type (`documentSource.ts` knows each piece's place in the file), and leaving
 * it saves the new words into that place, the rest of the file as it was, the way the file view
 * saves a file. Enter leaves a heading, a list item or a cell; Escape puts the words back. A piece
 * with formatting in it (bold, a link) is read only for now.
 */
export function StudioDocumentSurface(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
  readonly threadRef: ScopedThreadRef;
  readonly contents: string;
  readonly workspaceMutationId: string | null;
  readonly readOnly: boolean;
  readonly onPendingChange: (relativePath: string, pending: boolean) => void;
}) {
  const { environmentId, cwd, relativePath } = props;
  const editing = useRef<Editing | null>(null);
  const saveTarget = { environmentId, cwd, relativePath };
  useFileSaveSession(saveTarget, props.onPendingChange);
  const current = () =>
    getOptimisticProjectFileQueryData(environmentId, cwd, relativePath)?.contents ?? props.contents;
  const write = (next: string) => {
    if (next === current()) return;
    setProjectFileQueryData(environmentId, cwd, relativePath, next);
    changeFileSaveSession(saveTarget, next);
  };

  const finish = (save: boolean) => {
    const edit = editing.current;
    if (edit === null) return;
    editing.current = null;
    edit.element.removeAttribute("contenteditable");
    const words = edit.element.innerText;
    if (!save) {
      edit.element.innerText = edit.before;
      return;
    }
    if (words.trim() !== edit.before.trim()) {
      write(withWords(current(), edit.place, edit.kind, words));
    }
  };

  const begin = (event: MouseEvent<HTMLDivElement>) => {
    if (props.readOnly || !(event.target instanceof HTMLElement)) return;
    const piece = event.target.closest<HTMLElement>("[data-src-plain]");
    if (piece === null || piece === editing.current?.element) return;
    const place = readPlace(piece.getAttribute("data-src"));
    const kind = piece.getAttribute("data-src-kind");
    if (place === null || kind === null || !PIECE_KINDS.has(kind)) return;
    finish(true);
    editing.current = { element: piece, place, kind: kind as PieceKind, before: piece.innerText };
    piece.setAttribute("contenteditable", "plaintext-only");
    piece.focus();
    // The cursor goes where the click was, as in any editor.
    const at = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (at) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(at);
    }
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const edit = editing.current;
    if (edit === null || event.target !== edit.element) return;
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      edit.element.blur();
    } else if (event.key === "Enter" && edit.kind !== "paragraph" && !event.shiftKey) {
      event.preventDefault();
      edit.element.blur();
    }
  };

  return (
    <ScrollArea className="min-h-0 flex-1">
      {/* A document's piece is edited in place; React's copy is renewed once the file changes. */}
      <div
        key={props.contents}
        data-document-editable={props.readOnly ? undefined : ""}
        onClick={begin}
        onKeyDown={keys}
        onBlur={(event) => {
          if (event.target === editing.current?.element) finish(true);
        }}
      >
        <FileMarkdownPreview
          text={props.contents}
          cwd={cwd}
          relativePath={relativePath}
          threadRef={props.threadRef}
          workspaceMutationId={props.workspaceMutationId}
          onTaskListChange={
            props.readOnly
              ? undefined
              : ({ markerOffset, checked }) =>
                  write(setMarkdownTaskChecked(current(), markerOffset, checked))
          }
        />
      </div>
    </ScrollArea>
  );
}
