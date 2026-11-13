import { FolderInputIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useImportDialogStore } from "./importDialogStore";
import { droppedPath, readStudioImport } from "./studioImportBridge";

/** Over a box that attaches what is dropped on it, such as Home's start box. */
const onAttachBox = (target: EventTarget) =>
  target instanceof Element && target.closest("[data-attach-drop]") !== null;

/**
 * Drops on Home or Projects open Import on the projects they make; with `into`, they are added to
 * that project instead. A box marked `data-attach-drop` takes its own drops. Without the desktop
 * app nothing here takes a drop.
 */
export function ImportDropZone(props: {
  readonly children: ReactNode;
  /** The project dropped files go into, named; unset, they open Import's new projects. */
  readonly into?: { readonly name: string; readonly onPaths: (paths: string[]) => void };
}) {
  const show = useImportDialogStore((store) => store.show);
  const [dragging, setDragging] = useState<number | null>(null);
  if (readStudioImport() === null) return props.children;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        if (onAttachBox(event.target)) {
          setDragging(null);
          return;
        }
        event.preventDefault();
        setDragging(event.dataTransfer.items.length);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(null);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files") || onAttachBox(event.target)) return;
        event.preventDefault();
        setDragging(null);
        const paths = Array.from(event.dataTransfer.files).flatMap(
          (file) => droppedPath(file) ?? [],
        );
        if (paths.length === 0) return;
        if (props.into === undefined) show({ kind: "paths", paths });
        else props.into.onPaths(paths);
      }}
    >
      {props.children}
      {dragging === null ? null : (
        <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-primary/[0.035]">
          <div
            role="status"
            className="flex items-center gap-2 rounded-full border border-primary/25 bg-background/95 px-4 py-2.5 text-sm font-medium text-foreground shadow-lg"
          >
            <FolderInputIcon className="size-4 text-primary" aria-hidden="true" />
            {props.into === undefined
              ? dragging === 1
                ? "Drop to import it"
                : `Drop to import ${dragging} items`
              : dragging === 1
                ? `Drop to add it to ${props.into.name}`
                : `Drop to add ${dragging} items to ${props.into.name}`}
          </div>
        </div>
      )}
    </div>
  );
}
