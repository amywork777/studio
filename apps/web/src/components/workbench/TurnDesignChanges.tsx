import type { ScopedThreadRef } from "@t3tools/contracts";
import { type ReactNode, useState } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { Button } from "../ui/button";
import { BrainstormConcepts } from "./BrainstormConcepts";
import { conceptSetOf } from "./brainstorm";
import { type DesignChange, designChanges, foldChanges } from "./designChanges";
import { FILE_ICONS, fileIconKey, fileTint } from "./kinds";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { showOverview } from "./overviewPanel";
import { useEngineeringInterface } from "./studioInterface";
import { classifyProjectFile } from "./projectFiles";
import { useFolderModels } from "./useFolderModels";
import { useOpenInWorkbench } from "./useOpenInWorkbench";
import { changeSentence, versionAround } from "./turnChange";
import {
  type CadPost,
  useCadService,
  useComparison,
  usePartVersions,
  useVersionRequestStore,
} from "./useVersions";
import { sizeChanges, sizeLine } from "./versions";

/** A part's model, which has versions to compare (`PartVersions`). */
const VERSIONED = /\.(?:step|stp)$/i;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** The parts whose sizes the card reads, first first: each is one comparison of its script. */
const SIZED_ROWS = 3;

/**
 * The sizes a turn changed in a part's script, from the CAD service's comparison of its version
 * before and after the turn (`versions/compare`, no solids built): "wall 2 to 3". Nothing when
 * the turn made no version of it or the comparison has not answered.
 */
function useTurnSizes(input: {
  readonly post: CadPost | null;
  readonly folder: string;
  readonly script: string | null;
  readonly checkpointRef: string | null;
}): { readonly lines: ReadonlyArray<string>; readonly version: number | null } {
  const { post, folder, script, checkpointRef } = input;
  const versions = usePartVersions({
    post: checkpointRef === null ? null : post,
    folder,
    path: script,
    mutationId: null,
  });
  const around =
    versions === null || versions.versions === null || checkpointRef === null
      ? null
      : versionAround(versions.versions, checkpointRef);
  const { state } = useComparison({
    post: script === null ? null : post,
    folder,
    path: script ?? "",
    older: around?.older ?? null,
    newer: around?.newer ?? null,
    model: null,
    texts: [],
  });
  const compared = state?.comparison?.script;
  const changed = sizeChanges(compared?.olderSizes ?? null, compared?.newerSizes ?? null, compared);
  return {
    lines: changed === null ? [] : changed.map((change) => sizeLine(change, "")),
    version: around?.number ?? null,
  };
}

/** One part or document the turn changed: its name, what of it changed, and the sizes that did. */
function ChangeRow(props: {
  readonly change: DesignChange;
  readonly onOpen: (() => void) | null;
  readonly compares: boolean;
  readonly post: CadPost | null;
  readonly folder: string;
  readonly checkpointRef: string | null;
  readonly sized: boolean;
}) {
  const { change } = props;
  const key = fileIconKey(change.kind);
  const Icon = FILE_ICONS[key];
  const sizes = useTurnSizes({
    post: props.sized ? props.post : null,
    folder: props.folder,
    script: props.sized ? change.script : null,
    checkpointRef: props.checkpointRef,
  });
  const name = (
    <>
      <Icon className={`size-3.5 shrink-0 ${fileTint(key)}`} aria-hidden="true" />
      <span className="truncate font-medium text-foreground">{change.name}</span>
    </>
  );
  return (
    <li className="flex min-w-0 flex-col gap-0.5" data-turn-change="">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm leading-5">
        {props.onOpen === null ? (
          <span className="flex max-w-full min-w-0 items-center gap-1.5">{name}</span>
        ) : (
          <button
            type="button"
            onClick={props.onOpen}
            aria-label={
              props.compares ? `See what changed in ${change.name}` : `Open ${change.name}`
            }
            className="-mx-1 flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1 outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {name}
          </button>
        )}
        <span className="shrink-0 text-muted-foreground">{changeSentence(change)}</span>
        {sizes.version === null ? null : (
          <span className="shrink-0 text-muted-foreground">· Version {sizes.version}</span>
        )}
      </div>
      {sizes.lines.length === 0 ? null : (
        <ul className="flex flex-col pl-5 text-xs leading-5 text-muted-foreground tabular-nums">
          {sizes.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * What a turn changed, as a card under its reply: each part or document, what of it changed, the
 * sizes that changed from the version comparison and the version the turn made; a part opens what
 * changed in it (Versions, where it can be restored).
 */
function DesignChanges(props: {
  readonly threadRef: ScopedThreadRef;
  readonly changes: ReadonlyArray<DesignChange>;
  readonly other: number;
  readonly checkpointRef: string | null;
}) {
  const open = useOpenInWorkbench(props.threadRef);
  const { changes, other, checkpointRef, threadRef } = props;
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = foldChanges(changes, expanded);
  const workspace = useOpenWorkspaceStore((state) => state.workspace?.folder ?? "");
  const models = useFolderModels(threadRef.environmentId, workspace);
  const post = useCadService(threadRef);
  const compares = (change: DesignChange) =>
    checkpointRef !== null &&
    change.open !== null &&
    VERSIONED.test(change.open) &&
    // A study's copy of a part has no Versions of its own, so it opens as itself.
    classifyProjectFile(change.open)?.kind !== "Result";
  // A changed part shows what changed in it, in the Overview's Versions, at this turn's version.
  const showChange = (change: DesignChange) => {
    // A part whose only change is its script opens as the model the script makes.
    const path = change.open ?? models.find((model) => model.script === change.script)?.id ?? null;
    if (path === null) return null;
    return () => {
      // The project's README is its Overview: the pinned tab comes to the front, not a copy.
      if (/^(?:\.\/)?readme\.md$/i.test(path)) {
        showOverview(threadRef);
        return;
      }
      const folder = useOpenWorkspaceStore.getState().workspace?.folder ?? null;
      if (!compares(change) || checkpointRef === null || folder === null) {
        open(path);
        return;
      }
      useVersionRequestStore.getState().ask({ folder, path, ref: checkpointRef });
      useRightPanelStore.getState().open(threadRef, "files");
    };
  };
  return (
    <section
      aria-label="What changed"
      data-design-changes=""
      className="mt-3 flex min-w-0 flex-col gap-2 rounded-md border border-border px-3 py-2"
    >
      {changes.length === 0 ? null : (
        <>
          <h3 className="text-xs text-muted-foreground">What changed</h3>
          <ul className="flex min-w-0 flex-col gap-1.5">
            {shown.map((change, index) => (
              <ChangeRow
                key={`${change.kind}\n${change.label}`}
                change={change}
                onOpen={showChange(change)}
                compares={compares(change)}
                post={post}
                folder={workspace}
                checkpointRef={checkpointRef}
                sized={index < SIZED_ROWS && change.script !== null && workspace !== ""}
              />
            ))}
          </ul>
          {hidden === 0 && !expanded ? null : (
            <div className="flex gap-1">
              {hidden === 0 ? null : (
                <Button size="xs" variant="ghost-muted" onClick={() => setExpanded(true)}>
                  {hidden} more
                </Button>
              )}
              {expanded ? (
                <Button size="xs" variant="ghost-muted" onClick={() => setExpanded(false)}>
                  Show less
                </Button>
              ) : null}
            </div>
          )}
        </>
      )}
      {other === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          {changes.length === 0
            ? `Updated ${plural(other, "project file")}`
            : `and ${plural(other, "other file")}`}
        </p>
      )}
    </section>
  );
}

/**
 * A turn's entry in the design history. In the engineering interface it lists the parts and
 * documents it changed in place of `children`'s files; elsewhere `children` as they are. The
 * changes come from the turn's checkpoint, so they are what the files say, whatever the agent
 * reported.
 */
export function TurnDesignChanges(props: {
  readonly threadRef: ScopedThreadRef | null;
  readonly files: ReadonlyArray<{ readonly path: string }>;
  /** The turn's checkpoint: a changed part opens what changed in it since the turn before. */
  readonly checkpointRef?: string | null | undefined;
  readonly children: ReactNode;
}) {
  const engineering = useEngineeringInterface();
  const workspace = useOpenWorkspaceStore((state) => state.workspace?.folder ?? "");
  const paths = props.files.map((file) => file.path);
  const { changes, other } = designChanges(paths);
  // A set of concepts the turn wrote shows as its cards, in either interface.
  const sets = [...new Set(paths.flatMap((path) => conceptSetOf(path) ?? []))].toSorted(
    (a, b) => a - b,
  );
  const threadRef = props.threadRef;
  const concepts =
    threadRef === null || workspace === ""
      ? null
      : sets.map((set) => (
          <BrainstormConcepts key={set} threadRef={threadRef} root={workspace} set={set} />
        ));
  if (!engineering) {
    return (
      <>
        {concepts}
        {props.children}
      </>
    );
  }
  if (props.threadRef === null || (changes.length === 0 && other === 0)) return null;
  return (
    <>
      {concepts}
      <DesignChanges
        threadRef={props.threadRef}
        changes={changes}
        other={other}
        checkpointRef={props.checkpointRef ?? null}
      />
    </>
  );
}
