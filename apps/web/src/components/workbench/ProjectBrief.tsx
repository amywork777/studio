import { AuthOrchestrationOperateScope, type EnvironmentId } from "@t3tools/contracts";
import { studioFolderName } from "@t3tools/shared/studioProjects";
import { ChevronDownIcon, FileTextIcon, PaperclipIcon } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { useEnvironmentScope } from "~/state/session";
import { Button } from "../ui/button";
import { MODULE_HEADING } from "./studioLayout";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import {
  EMPTY_BRIEF,
  PROCESSES,
  type ProjectBrief as Brief,
  type SetupKey,
  setupRequest,
} from "./briefFolder";
import { MaterialPicker } from "./MaterialPicker";
import { handToChat } from "./handToChat";
import {
  useSaveStudioProject,
  useStudioProjectAt,
  useStudioProjectsList,
} from "./useStudioProjects";

/** One line of the spec sheet: its label in a drawing's tracked capitals, its field beside it. */
function SpecRow(props: {
  readonly label: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 border-b border-border py-3 last:border-b-0">
      <label htmlFor={props.htmlFor} className={`${MODULE_HEADING} pt-2`}>
        {props.label}
      </label>
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

/**
 * Saves the brief on the folder's project, making the folder a one-folder
 * project if it is in none. Saves run one after another, so two quick edits
 * on a folder in no project make one project, not two.
 */
function useSaveBrief(environmentId: EnvironmentId, cwd: string) {
  const current = useStudioProjectAt(environmentId, cwd);
  const saveProject = useSaveStudioProject(environmentId);
  const created = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  return (brief: Brief): Promise<boolean> => {
    const run = queue.current.then(async () => {
      const id = current?.id ?? created.current;
      const saved = await saveProject(
        id,
        current === null
          ? {
              name: studioFolderName(cwd),
              template: null,
              brief,
              folders: [cwd],
              createdAt: new Date().toISOString(),
            }
          : { ...current.project, brief },
      );
      if (saved !== null) created.current = saved;
      return saved !== null;
    });
    queue.current = run;
    return run;
  };
}

/** One property of the setup bar: its name, then its control. */
function Property(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.children}
    </div>
  );
}

/**
 * The project's setup, shown the way a CAD tool shows its document
 * properties: units, material (from the library, `MaterialPicker`), process
 * and quantity. Picking a value sends the request to the chat, as the part
 * menus send a job, and the agent changes the setup (the project's
 * `project.json`, `studioProjectContext`), says what it means for the parts,
 * and waits for a go. Only a folder in no project yet is set up in place,
 * since there is no project for the agent to change. What the project is for
 * and must meet, with its links, notes and references, is the brief behind
 * Brief. Every agent in the project reads all of it first.
 */
export function ProjectSetup(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly composerRef: ComposerHandleRef;
  /** The thread's workspace changes: the agent may have changed the setup. */
  readonly workspaceMutationId: string | null;
}) {
  const studio = useStudioProjectAt(props.environmentId, props.cwd);
  const stored = studio?.project.brief ?? null;
  const { refresh } = useStudioProjectsList(props.environmentId);
  useWorkspaceMutationRefresh({
    mutationId: props.workspaceMutationId,
    refresh,
    resourceKey: `project-setup:${props.cwd}`,
  });
  // What this page last saved wins until the next read of the project, which may carry the agent's change.
  const [local, setLocal] = useState<{
    readonly cwd: string;
    readonly brief: Brief;
    readonly over: Brief | null;
  } | null>(null);
  const brief =
    local !== null && local.cwd === props.cwd && local.over === stored
      ? local.brief
      : (stored ?? EMPTY_BRIEF);
  const saveBrief = useSaveBrief(props.environmentId, props.cwd);
  const canWrite = useEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope);
  const [open, setOpen] = useState(false);
  // Each opening starts the sheet from the brief as it stands.
  const [opened, setOpened] = useState(0);
  // The quantity field's text while it is being typed; saved on Enter or leaving it.
  const [quantity, setQuantity] = useState<string | null>(null);

  const update = (key: SetupKey, value: string) => {
    if (studio === null) {
      // No project yet: this is its first setup, saved in place.
      const next = { ...brief, [key]: value };
      setLocal({ cwd: props.cwd, brief: next, over: stored });
      void saveBrief(next).then((saved) => {
        if (!saved) setLocal(null);
      });
      return;
    }
    // Sent as a CAD tool applies a property: the agent changes the setup and says what it means.
    handToChat(props.composerRef, setupRequest(key, value));
  };
  const commitQuantity = () => {
    if (quantity === null) return;
    setQuantity(null);
    if (quantity.trim() !== brief.quantity.trim()) update("quantity", quantity.trim());
  };
  const described = brief.purpose.trim() !== "" || brief.requirements.trim() !== "";

  return (
    <div className="pointer-events-auto mt-4 text-left">
      <div
        role="group"
        aria-label="Project setup"
        className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border px-3 py-2"
      >
        <Property label="Units">
          <ToggleGroup
            aria-label="Units"
            value={[brief.units]}
            disabled={!canWrite}
            onValueChange={(next) => {
              const units = next[0];
              if ((units === "mm" || units === "in") && units !== brief.units)
                update("units", units);
            }}
          >
            <Toggle value="mm">mm</Toggle>
            <Toggle value="in">in</Toggle>
          </ToggleGroup>
        </Property>
        <Property label="Material">
          <MaterialPicker
            value={brief.material.trim()}
            onChange={(material) => {
              if (material !== brief.material.trim()) update("material", material);
            }}
            trigger={
              <Button variant="ghost" size="sm" disabled={!canWrite} aria-label="Material">
                {brief.material.trim() === "" ? (
                  <span className="text-muted-foreground">Choose</span>
                ) : (
                  brief.material.trim()
                )}
                <ChevronDownIcon className="opacity-60" aria-hidden="true" />
              </Button>
            }
          />
        </Property>
        <Property label="Process">
          <Select
            value={brief.process}
            disabled={!canWrite}
            onValueChange={(value) => {
              const process = PROCESSES.find((entry) => entry === value);
              if (process && process !== brief.process) update("process", process);
            }}
          >
            <SelectTrigger size="sm" aria-label="Process">
              <SelectValue>
                {brief.process === EMPTY_BRIEF.process ? (
                  <span className="text-muted-foreground">Choose</span>
                ) : (
                  brief.process
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {PROCESSES.map((process) => (
                <SelectItem key={process} hideIndicator value={process}>
                  {process}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Property>
        <Property label="Quantity">
          <Input
            size="sm"
            className="w-16"
            inputMode="numeric"
            aria-label="Quantity"
            placeholder="1"
            disabled={!canWrite}
            value={quantity ?? brief.quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onBlur={commitQuantity}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setQuantity(null);
            }}
          />
        </Property>
        <div className="ms-auto">
          <Button
            variant={described ? "ghost-muted" : "outline"}
            size="sm"
            onClick={() => {
              setOpened((count) => count + 1);
              setOpen(true);
            }}
          >
            <FileTextIcon />
            {described ? "Brief" : "Write the brief"}
          </Button>
        </div>
      </div>
      <BriefSheet
        key={opened}
        open={open}
        onOpenChange={setOpen}
        environmentId={props.environmentId}
        initial={brief}
        save={saveBrief}
        composerRef={props.composerRef}
        onSaved={(next) => setLocal({ cwd: props.cwd, brief: next, over: stored })}
      />
    </div>
  );
}

/** The brief: what the project is for and must meet, its links, notes and references. */
function BriefSheet(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly initial: Brief;
  readonly save: (brief: Brief) => Promise<boolean>;
  readonly composerRef: ComposerHandleRef;
  readonly onSaved: (brief: Brief) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Brief>(props.initial);
  const [saving, setSaving] = useState(false);
  const [attached, setAttached] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const canWrite = useEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope);
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    const saved = await props.save(draft);
    setSaving(false);
    if (!saved) return;
    props.onSaved(draft);
    props.onOpenChange(false);
    toastManager.add({
      type: "success",
      title: "Brief saved",
      description: "Every agent in the project reads it before it starts.",
    });
  };

  const attach = (files: File[]) => {
    const composer = props.composerRef.current;
    if (!composer || files.length === 0) return;
    composer.addReferences(files);
    setAttached((count) => count + files.length);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Brief</DialogTitle>
          <DialogDescription>
            What the project is for and what it must meet. Every agent working in the project reads
            it first, with the units, material and process above.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="border-t border-border">
            <SpecRow label="What it is" htmlFor={`${id}-purpose`}>
              <Textarea
                id={`${id}-purpose`}
                size="sm"
                value={draft.purpose}
                onChange={(event) => set("purpose", event.target.value)}
                placeholder="What is it, and what must it do?"
              />
            </SpecRow>
            <SpecRow label="Requirements" htmlFor={`${id}-requirements`}>
              <Textarea
                id={`${id}-requirements`}
                size="sm"
                value={draft.requirements}
                onChange={(event) => set("requirements", event.target.value)}
                placeholder="Loads, environment, fits, standards it must meet"
              />
            </SpecRow>
            <SpecRow label="Links" htmlFor={`${id}-links`}>
              <Textarea
                id={`${id}-links`}
                size="sm"
                value={draft.links}
                onChange={(event) => set("links", event.target.value)}
                placeholder="Datasheets, suppliers, inspiration: one per line"
              />
            </SpecRow>
            <SpecRow label="Notes" htmlFor={`${id}-notes`}>
              <Textarea
                id={`${id}-notes`}
                size="sm"
                value={draft.notes}
                onChange={(event) => set("notes", event.target.value)}
                placeholder="Anything else the agent should know"
              />
            </SpecRow>
            <SpecRow label="References">
              <div
                className="flex min-h-16 flex-col items-start justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  attach([...event.dataTransfer.files]);
                }}
              >
                <span>
                  Drop sketches, photos, datasheets or mating parts. They go in the project's
                  References.
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                    <PaperclipIcon />
                    Choose files
                  </Button>
                  {attached === 0 ? null : (
                    <span role="status" className="text-foreground">
                      {attached === 1 ? "1 file" : `${attached} files`} added
                    </span>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    attach([...(event.target.files ?? [])]);
                    event.target.value = "";
                  }}
                />
              </div>
            </SpecRow>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canWrite || saving}>
            {saving ? "Saving..." : "Save brief"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
