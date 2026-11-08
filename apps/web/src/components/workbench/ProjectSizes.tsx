import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { studioFolderName } from "@t3tools/shared/studioProjects";
import { RulerIcon } from "lucide-react";
import { useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { Button } from "../ui/button";
import { GROUP_LABEL, SECTION_STACK } from "./studioLayout";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { handToChat } from "./handToChat";
import { HeadingLink, OverviewModule } from "./OverviewModules";
import { humanName } from "./partNames";
import {
  type NamedSize,
  plainSizesError,
  SIZE_NAME,
  SIZE_NUMBER,
  type SizeGroup,
  sharedAddedNote,
  sizeChangedNote,
  sharedSizePrompt,
} from "./sizes";
import { addSharedSize, changeSize, useProjectSizes } from "./useSizes";
import { type CadPost, useCadService } from "./useVersions";

/** A name as typed, as the scripts write one: "wall thickness" reads WALL_THICKNESS. */
const asSizeName = (typed: string) =>
  typed
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

/**
 * Sizes on the Overview: every named size in the project's scripts in one table, as a CAD tool's
 * global variables. The shared ones come first (`sizes.py` beside the parts, which import them),
 * with the parts that use them; then each part's own, the named numbers at the top of its script.
 * A number changes where it is written, a click away, and every part that uses its file is built
 * again; a formula of other sizes changes where those are. Add shared size writes a new one, and
 * Use it in parts asks the agent to put it to work. The agent is told of each change, as of a hand
 * edit.
 */
export function ProjectSizes(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly folders: ReadonlyArray<string>;
  readonly mutationId: string | null;
  readonly composerRef: ComposerHandleRef | null;
  readonly folded: boolean;
  readonly onFold: () => void;
}) {
  const post = useCadService(props.threadRef);
  const [reads, setReads] = useState(0);
  const read = useProjectSizes({
    post,
    folders: props.folders,
    mutationId: props.mutationId,
    reads,
  });
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<{ readonly name: string; readonly file: string } | null>(null);
  // Each folder's sizes are its own (a part's imports resolve beside it), under the folder's name
  // where the project has several, as the Overview's CAD shows their parts.
  const readable = (read ?? []).flatMap((entry) =>
    entry.sizes === null ? [] : [{ folder: entry.folder, sizes: entry.sizes }],
  );
  const shown = readable.filter((entry) => entry.sizes.groups.length > 0);
  const named = (read?.length ?? 0) > 1;
  const count = shown.reduce(
    (total, entry) =>
      total + entry.sizes.groups.reduce((sum, group) => sum + group.sizes.length, 0),
    0,
  );
  // A new shared size goes beside the parts of the first folder with sizes.
  const home = shown[0] ?? readable[0] ?? null;
  const tell = (note: string) =>
    props.composerRef?.current?.insertTextAtEnd(note, {
      ensureLeadingBoundary: true,
      stayHidden: true,
    });
  const changeSize = useChangeSize(post, props.composerRef, () => setReads((value) => value + 1));
  const change = (folder: string, group: SizeGroup, size: NamedSize, text: string) =>
    changeSize(folder, group.file, size, text);

  const add = async (name: string, text: string, note: string): Promise<string | null> => {
    if (post === null || home === null) return "Studio's CAD service is not running.";
    const result = await addSharedSize(post, { folder: home.folder, name, text, note });
    if ("error" in result) return plainSizesError(result.error);
    tell(sharedAddedNote({ name, file: result.file, text }));
    setAdding(false);
    setAdded({ name, file: result.file });
    setReads((value) => value + 1);
    return null;
  };

  return (
    <OverviewModule
      title="Sizes"
      icon={RulerIcon}
      {...(count > 0 ? { count } : {})}
      wide
      folded={props.folded}
      onFold={props.onFold}
      {...(home === null || adding
        ? {}
        : { action: <HeadingLink label="Add shared size" onClick={() => setAdding(true)} /> })}
    >
      <div className={SECTION_STACK}>
        {read === null ? (
          <p className="text-xs text-muted-foreground">Reading the sizes</p>
        ) : home === null ? (
          // No folder could be read: the first one's reason.
          <p className="text-xs text-muted-foreground">
            {plainSizesError(read.find((entry) => entry.error !== null)?.error ?? "")}
          </p>
        ) : shown.length === 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            No named sizes yet. A part's sizes are the named numbers at the top of its script, like
            WIDTH = 40, and sizes several parts share go in {home.sizes.sharedFile}.
          </p>
        ) : (
          shown.map((entry) => (
            <div key={entry.folder} className="flex min-w-0 flex-col gap-3">
              {named ? (
                <h3 className={`${GROUP_LABEL} truncate`}>{studioFolderName(entry.folder)}</h3>
              ) : null}
              {entry.sizes.groups.map((group) => (
                <SizeTable
                  key={group.file}
                  group={group}
                  onChange={(changed, size, text) => change(entry.folder, changed, size, text)}
                />
              ))}
            </div>
          ))
        )}
        {adding && home !== null ? (
          <AddShared
            sharedFile={home.sizes.sharedFile}
            where={named ? studioFolderName(home.folder) : null}
            onAdd={add}
            onCancel={() => setAdding(false)}
          />
        ) : null}
        {added !== null && props.composerRef !== null ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span>
              {added.name} is in {added.file}. No part uses it yet.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (props.composerRef !== null)
                  handToChat(props.composerRef, sharedSizePrompt(added));
                setAdded(null);
              }}
            >
              Use it in parts
            </Button>
          </div>
        ) : null}
      </div>
    </OverviewModule>
  );
}

/**
 * Changes one size where it is written, tells the agent as of a hand change, and says which parts
 * rebuild: the one way a size changes, from Sizes or from a node. Resolves to whether it changed.
 */
export function useChangeSize(
  post: CadPost | null,
  composerRef: ComposerHandleRef | null,
  onChanged: () => void,
) {
  return async (folder: string, file: string, size: NamedSize, text: string): Promise<boolean> => {
    if (post === null) return false;
    const result = await changeSize(post, {
      folder,
      file,
      name: size.name,
      line: size.line,
      old: size.text,
      text,
    });
    if ("error" in result) {
      toastManager.add({
        type: "error",
        title: `Couldn't change ${size.name}`,
        description: plainSizesError(result.error),
      });
      return false;
    }
    composerRef?.current?.insertTextAtEnd(
      sizeChangedNote({ name: size.name, file, from: size.text, to: text }),
      { ensureLeadingBoundary: true, stayHidden: true },
    );
    toastManager.add({
      type: "success",
      title: `${size.name} is ${text}`,
      ...(result.parts.length === 0
        ? {}
        : { description: `Rebuilding ${result.parts.map(humanName).join(", ")}` }),
    });
    onChanged();
    return true;
  };
}

/** One script's sizes: a shared file's, with the parts that use them, or a part's own. */
function SizeTable(props: {
  readonly group: SizeGroup;
  readonly onChange: (group: SizeGroup, size: NamedSize, text: string) => Promise<boolean>;
}) {
  const { group } = props;
  const title =
    group.kind === "shared"
      ? group.name === "sizes"
        ? "Shared"
        : `Shared in ${group.file}`
      : humanName(group.name);
  return (
    <section aria-label={title} className={SECTION_STACK}>
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className={`${GROUP_LABEL} shrink-0`}>{title}</h3>
        {group.kind === "shared" ? (
          <span className="truncate text-xs text-muted-foreground">
            {group.usedBy.length === 0
              ? "No part uses these yet"
              : `Used by ${group.usedBy.map(humanName).join(", ")}`}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col divide-y divide-border rounded-lg border border-border">
        {group.sizes.map((size) => (
          <SizeRow key={size.name} group={group} size={size} onChange={props.onChange} />
        ))}
      </div>
    </section>
  );
}

/** A size: its name, its number (a click changes it) or its formula, and what it is for. */
function SizeRow(props: {
  readonly group: SizeGroup;
  readonly size: NamedSize;
  readonly onChange: (group: SizeGroup, size: NamedSize, text: string) => Promise<boolean>;
}) {
  const { group, size } = props;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async (typed: string) => {
    if (typed === size.text) {
      setEditing(false);
      return;
    }
    if (!SIZE_NUMBER.test(typed)) {
      toastManager.add({
        type: "error",
        title: `Couldn't change ${size.name}`,
        description: `${size.name} is a number here, like 12.5.`,
      });
      return;
    }
    setSaving(true);
    const done = await props.onChange(group, size, typed);
    setSaving(false);
    if (done) setEditing(false);
  };
  return (
    <div className="grid min-h-9 min-w-0 grid-cols-[minmax(0,11rem)_minmax(0,9rem)_minmax(0,1fr)] items-center gap-3 px-3 py-1 text-sm">
      <span className="truncate text-foreground">{size.name}</span>
      {editing ? (
        <Input
          size="compact"
          autoFocus
          disabled={saving}
          defaultValue={size.text}
          aria-label={`${size.name}, Enter to change`}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => {
            if (!saving) setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
            else if (event.key === "Enter") void save(event.currentTarget.value.trim());
          }}
        />
      ) : size.editable ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Change ${size.name}, now ${size.text}`}
          className="-mx-1.5 w-fit max-w-full truncate rounded-md px-1.5 py-0.5 text-start text-foreground tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {size.text}
        </button>
      ) : (
        // Worked out from other sizes, which change where they are written.
        <span className="truncate text-muted-foreground">= {size.text}</span>
      )}
      <span className="truncate text-xs text-muted-foreground">{size.note}</span>
    </div>
  );
}

/** A new shared size: its name, its number and what it is for, written beside the parts. */
function AddShared(props: {
  readonly sharedFile: string;
  /** The folder it goes in, where the project has several; else null. */
  readonly where: string | null;
  readonly onAdd: (name: string, text: string, note: string) => Promise<string | null>;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const named = asSizeName(name);
    const typed = text.trim();
    if (!SIZE_NAME.test(named)) {
      setProblem("Give it a name of letters, digits and spaces, starting with a letter.");
      return;
    }
    if (!SIZE_NUMBER.test(typed)) {
      setProblem("Its value is a number, like 2.5.");
      return;
    }
    setSaving(true);
    setProblem(await props.onAdd(named, typed, note));
    setSaving(false);
  };
  return (
    <form
      aria-label="Add shared size"
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,9rem)_minmax(0,1fr)]">
        <Input
          size="sm"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Wall thickness"
          aria-label="Name"
        />
        <Input
          size="sm"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="2"
          aria-label="Value"
        />
        <Input
          size="sm"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What it's for, like every outer wall"
          aria-label="What it's for"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          {problem ??
            (props.where === null
              ? `It goes in ${props.sharedFile}, and parts use it by name.`
              : `It goes in ${props.sharedFile} in ${props.where}, and its parts use it by name.`)}
        </span>
      </div>
    </form>
  );
}
