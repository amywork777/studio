import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import type { CheckResult } from "./checkResults";
import { GitInstallSteps } from "./GitInstallSteps";
import { OverviewModule } from "./OverviewModules";
import type { ProjectFile } from "./projectFiles";
import { useStudioProjectsList } from "./useStudioProjects";
import {
  restoreVersion,
  useCadService,
  usePartVersions,
  useVersionRequestStore,
} from "./useVersions";
import { type VersionChoice, WhatChanged } from "./WhatChanged";
import {
  checkpointScopeOf,
  isPartPath,
  keepsNoVersions,
  plainRestoreError,
  plainVersionsError,
  readCheckpointRef,
  restoreNote,
  versionChoices,
  versionedPath,
} from "./versions";
import { chatLabel } from "./workspaceTitle";

/** A part of the project, as the Overview lists it. */
export interface VersionedPart {
  readonly root: string;
  readonly file: ProjectFile;
  readonly results: ReadonlyArray<CheckResult>;
}

const SHOWN = 6;
const partKey = (part: VersionedPart) =>
  `${studioFolderKey(part.root)}\n${versionedPath(part.file)}`;

/** Which chat each checkpoint scope is, worked out from the project's chats. */
function useChatsByScope(chats: ReadonlyArray<EnvironmentThreadShell>) {
  const [byScope, setByScope] = useState<ReadonlyMap<string, EnvironmentThreadShell>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      chats.map(async (chat) => [await checkpointScopeOf(chat.id), chat] as const),
    ).then((pairs) => {
      if (!cancelled) setByScope(new Map(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [chats]);
  return byScope;
}

/**
 * The Overview's Versions: a part's versions, newest first, each a chat turn that changed it (or the
 * file as edited by hand since), and what changed in the one picked against the one before it
 * (`WhatChanged`). A Changed chip in the chat opens it on its turn (`useVersionRequestStore`).
 * Versions are the project's checkpoints, read by the CAD service (`cadgen/edit/versions.py`).
 */
export function PartVersions(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  /** The project's parts, the lead part first. */
  readonly parts: ReadonlyArray<VersionedPart>;
  readonly chats: ReadonlyArray<EnvironmentThreadShell>;
  readonly units: string;
  readonly mutationId: string | null;
  readonly folded: boolean;
  readonly onFold: () => void;
  readonly onOpen: (root: string, path: string) => void;
  /** The chat's composer, where a restore's note to the agent goes quietly, as a hand edit's does. */
  readonly composerRef?: ComposerHandleRef | null;
}) {
  useNowMinute();
  const post = useCadService(props.threadRef);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<{
    readonly key: string;
    readonly newer: string;
    readonly older: string | null;
  } | null>(null);
  const [all, setAll] = useState(false);
  const section = useRef<HTMLDivElement>(null);
  // A Changed chip asks for a part at its turn (`useVersionRequestStore`): while the request
  // stands, that part shows, at the turn's version. Choosing anything here lets it go.
  const request = useVersionRequestStore((store) => store.request);
  const take = useVersionRequestStore((store) => store.take);
  const asked =
    request === null
      ? null
      : (props.parts.find(
          (entry) =>
            studioFolderKey(entry.root) === studioFolderKey(request.folder) &&
            isPartPath(entry.file, request.path),
        ) ?? null);
  const part =
    asked ?? props.parts.find((entry) => partKey(entry) === chosenKey) ?? props.parts[0] ?? null;
  const key = part === null ? "" : partKey(part);
  // Each restore reads the versions again, as the agent's changes do.
  const [restores, setRestores] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const listed = usePartVersions({
    post,
    folder: part?.root ?? "",
    path: part === null ? null : versionedPath(part.file),
    mutationId: `${props.mutationId ?? ""}\n${restores}`,
  });
  const versions = listed?.versions ?? null;
  // With no git on the computer nothing keeps versions, whatever the read's own error says.
  const needsGit = useStudioProjectsList(props.environmentId).data?.git === false;
  const byScope = useChatsByScope(props.chats);

  // Each new request, or the switcher's Version history, opens the module and brings it into view, once.
  const shownRequest = useRef<typeof request>(null);
  const revealAt = useVersionRequestStore((store) => store.revealAt);
  const revealed = useVersionRequestStore((store) => store.revealed);
  const { folded, onFold } = props;
  useEffect(() => {
    const asks = asked !== null && shownRequest.current !== request;
    const reveals = revealAt !== null;
    if (!asks && !reveals) return;
    shownRequest.current = request;
    if (reveals) revealed();
    // A reveal asked for long ago (from a project with no parts) is let go, not acted on.
    if (!asks && Date.now() - (revealAt ?? 0) > 10_000) return;
    if (folded) onFold();
    section.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [asked, folded, onFold, request, revealAt, revealed]);

  const choices = useMemo((): VersionChoice[] => {
    if (versions === null) return [];
    return versionChoices(
      versions,
      (version) => {
        const turn = readCheckpointRef(version.ref);
        const chat = turn === null ? undefined : byScope.get(turn.scope);
        return chat === undefined ? null : chatLabel(chat.title);
      },
      (version) => formatRelativeTimeLabel(new Date(version.time * 1000).toISOString()),
    );
  }, [byScope, versions]);

  // The version asked for (a chip's turn, found by its checkpoint) or picked, else the newest; against
  // the one before it unless another was picked.
  const pickedHere =
    asked !== null && request !== null
      ? { key, newer: `ref:${request.ref}`, older: null }
      : picked !== null && picked.key === key
        ? picked
        : null;
  const newerIndex = (() => {
    if (versions === null || versions.length === 0) return -1;
    if (pickedHere === null) return versions.length - 1;
    const wanted = pickedHere.newer.startsWith("ref:")
      ? versions.findIndex((version) => version.ref === pickedHere.newer.slice(4))
      : versions.findIndex((version) => version.id === pickedHere.newer);
    return wanted === -1 ? versions.length - 1 : wanted;
  })();
  const newer = newerIndex === -1 ? null : (choices[newerIndex] ?? null);
  const olderIndex = (() => {
    if (newerIndex <= 0) return -1;
    const chosen = pickedHere?.older ?? null;
    const at = chosen === null ? -1 : choices.findIndex((choice) => choice.id === chosen);
    return at !== -1 && at < newerIndex ? at : newerIndex - 1;
  })();
  const older = olderIndex === -1 ? null : (choices[olderIndex] ?? null);
  // A choice here lets a chip's request go, keeping its part.
  const settle = () => {
    if (request === null) return;
    take();
    setChosenKey(key);
  };
  const pick = (newerId: string, olderId: string | null) => {
    settle();
    setPicked({ key, newer: newerId, older: olderId });
  };

  // Restore this version, as Google Docs has it: no question first, since what was on disk is kept
  // as a version (`versions.py` `restore`); the agent hears of it with the next message.
  const restore = async () => {
    if (post === null || part === null || newer === null || restoring) return;
    const version = versions?.[newerIndex];
    if (version === undefined) return;
    setRestoring(true);
    const result = await restoreVersion(post, {
      folder: part.root,
      path: versionedPath(part.file),
      version: version.id,
    });
    setRestoring(false);
    if ("error" in result) {
      toastManager.add({
        type: "error",
        title: `Couldn't restore ${newer.label}`,
        description: plainRestoreError(result.error),
      });
      return;
    }
    const when = formatRelativeTimeLabel(new Date(version.time * 1000).toISOString());
    props.composerRef?.current?.insertTextAtEnd(
      restoreNote({ part: part.file.title, version: newer.label, when, files: result.restored }),
      { ensureLeadingBoundary: true, stayHidden: true },
    );
    toastManager.add({
      type: "success",
      title: `Restored ${newer.label} of ${part.file.title}`,
      ...(result.kept === null ? {} : { description: "What you had is kept as a version." }),
    });
    // The newest version, the one just restored, against what was there before it (a chip's
    // request for a turn's version lets go).
    settle();
    setPicked(null);
    setRestores((count) => count + 1);
  };
  const restorable = versions !== null && newerIndex !== -1 && newerIndex < versions.length - 1;

  // Keep versions, for a folder that keeps none (an imported one): its history starts as a new
  // project's does, what is in it now kept first, and the versions are read again.
  const startHistory = useAtomCommand(projectEnvironment.startHistory, { reportFailure: false });
  const [starting, setStarting] = useState(false);
  const keepVersions = async () => {
    if (part === null || starting) return;
    setStarting(true);
    const result = await startHistory({
      environmentId: props.environmentId,
      input: { cwd: part.root },
    });
    setStarting(false);
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: "Couldn't start keeping versions",
        description: "The files in the folder are as they were.",
      });
      return;
    }
    toastManager.add({
      type: "success",
      title: "Versions are kept from now on",
      description: "Each time the agent changes a part, a version is kept.",
    });
    setRestores((count) => count + 1);
  };

  const newestFirst = choices.toReversed();
  const shown = all ? newestFirst : newestFirst.slice(0, SHOWN);

  return (
    <div ref={section} className="@3xl:col-span-2 scroll-mt-4">
      <OverviewModule
        title="Versions"
        {...(versions === null ? {} : { count: versions.length })}
        wide
        folded={props.folded}
        onFold={props.onFold}
        action={
          props.parts.length < 2 || part === null ? undefined : (
            <Select
              value={key}
              onValueChange={(value) => {
                if (value === null) return;
                settle();
                setChosenKey(value);
              }}
            >
              <SelectTrigger size="sm" variant="ghost" aria-label="Part">
                <SelectValue>{part.file.title}</SelectValue>
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                {props.parts.map((entry) => (
                  <SelectItem key={partKey(entry)} hideIndicator value={partKey(entry)}>
                    {entry.file.title}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          )
        }
      >
        <div className="flex flex-col gap-3">
          {part === null ? (
            <p className="text-xs text-muted-foreground">No part yet, so no versions.</p>
          ) : listed === null ? (
            <p className="text-xs text-muted-foreground">Reading the versions.</p>
          ) : versions === null && !needsGit && keepsNoVersions(listed.error) ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {plainVersionsError(listed.error)}
              </p>
              <Button size="sm" disabled={starting} onClick={() => void keepVersions()}>
                {starting ? "Starting…" : "Keep versions"}
              </Button>
            </div>
          ) : versions === null ? (
            <p className="text-xs text-muted-foreground">
              {needsGit ? (
                <>
                  {
                    // oxlint-disable-next-line t3code/studio-engineering-words -- Names the program the person must install.
                    "Versions are off until git is installed. "
                  }
                  <GitInstallSteps environmentId={props.environmentId} />
                </>
              ) : (
                plainVersionsError(listed.error)
              )}
            </p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No versions yet. Each time the agent changes {part.file.title}, a version is kept.
            </p>
          ) : (
            <>
              <ol
                aria-label={`Versions of ${part.file.title}`}
                className="flex flex-col border-t border-border"
              >
                {shown.map((choice) => {
                  const index = choices.indexOf(choice);
                  const current = index === newerIndex;
                  return (
                    <li key={choice.id} className="border-b border-border">
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        onClick={() => pick(choice.id, null)}
                        className={cn(
                          "flex h-9 w-full min-w-0 items-center gap-3 px-2 text-left text-xs outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          current && "bg-accent/60",
                        )}
                      >
                        <span className="w-20 shrink-0 font-medium text-foreground">
                          {choice.label}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {choice.detail}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {choices.length > SHOWN ? (
                <button
                  type="button"
                  onClick={() => setAll((value) => !value)}
                  className="self-start text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
                >
                  {all ? "Show fewer" : `Show all ${choices.length}`}
                </button>
              ) : null}
              {newer === null || !restorable ? null : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                  <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {newer.label} of {part.file.title}, {newer.detail}
                  </p>
                  <Button
                    size="sm"
                    disabled={restoring || post === null}
                    onClick={() => void restore()}
                  >
                    {restoring ? "Restoring…" : "Restore this version"}
                  </Button>
                </div>
              )}
              {newer === null ? null : (
                <WhatChanged
                  key={`${key}\n${newer.id}`}
                  environmentId={props.environmentId}
                  post={post}
                  folder={part.root}
                  path={versionedPath(part.file)}
                  model={
                    versionedPath(part.file) === part.file.script ? (part.file.model ?? null) : null
                  }
                  older={older}
                  newer={newer}
                  olderChoices={choices.slice(0, Math.max(newerIndex, 0)).toReversed()}
                  onOlder={(id) => pick(newer.id, id)}
                  units={props.units}
                  checkPaths={part.results.map((result) => result.path)}
                  onOpen={(path) => props.onOpen(part.root, path)}
                />
              )}
            </>
          )}
        </div>
      </OverviewModule>
    </div>
  );
}
