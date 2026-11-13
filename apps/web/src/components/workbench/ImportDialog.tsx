import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import type { StudioImportKind } from "@t3tools/shared/studioImport";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { BoxIcon, FolderPlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { cn } from "~/lib/utils";
import { waitForProject } from "~/state/entities";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { MODULE_HEADING } from "./studioLayout";
import { Checkbox } from "../ui/checkbox";
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
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { type ImportStart, useImportDialogStore } from "./importDialogStore";
import {
  countByKind,
  describeCounts,
  type ImportFile,
  needsALook,
  placeName,
  planImport,
  type ScannedRoot,
  suggestProject,
} from "./importPlan";
import { KIND_TINT } from "./kinds";
import { importedToOpen } from "./importIntoProject";
import { showProject } from "./overviewPanel";
import { openFromOverview } from "./useOpenInWorkbench";
import { RestoreDialogHost } from "./RestoreDialog";
import { partLabel } from "./partNames";
import { usePictures } from "./usePictures";
import { readStudioImport, rememberScan } from "./studioImportBridge";
import { useImportProjects } from "./useImportProjects";
import { useTrashedProjects } from "./trash/useTrash";
import { useStudioProjects } from "./useStudioProjects";

const KIND_LABELS: ReadonlyArray<readonly [StudioImportKind, string]> = [
  ["model", "CAD models"],
  ["drawing", "Drawings"],
  ["partsList", "Parts lists"],
  ["datasheet", "Datasheets"],
  ["photo", "Photos"],
  ["notes", "Notes and specs"],
];

const baseName = (path: string) => path.split(/[\\/]+/).findLast((part) => part !== "") ?? path;
const plural = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;
const NOTHING_FOUND = (root: string): ScannedRoot => ({ root, files: [] });

/** The Import dialog, wherever it was asked for (`importDialogStore.ts`). */

/** The models the server can picture, by their endings (as `modelPictures.ts` renders them). */
const PICTURED = /\.(?:step|stp|xbf|stl|3mf|glb|dxf)$/i;

/**
 * A found project's picture, as its tile on Home will show it: its first model, rendered where it
 * lies (nothing is copied to picture it), or the kind's icon until it is.
 */
function FoundPicture(props: {
  readonly environmentId: EnvironmentId;
  readonly folder: string;
  readonly files: ReadonlyArray<ImportFile>;
}) {
  const root = props.folder.replace(/[\\/]+$/, "");
  const model = props.files.find(
    (file) => file.kind === "model" && PICTURED.test(file.path) && file.path.startsWith(`${root}/`),
  );
  const path = model === undefined ? null : model.path.slice(root.length + 1);
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: root,
    paths: path === null ? [] : [path],
  });
  const picture = path === null ? undefined : pictures.get(path);
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-(--model-ground)">
      {picture ? (
        <img src={picture} alt="" className="size-full object-cover" />
      ) : (
        <BoxIcon className={cn("size-5 opacity-60", KIND_TINT)} aria-hidden="true" />
      )}
    </span>
  );
}

export function ImportDialogHost(props: { readonly environmentId: EnvironmentId }) {
  const start = useImportDialogStore((store) => store.start);
  const count = useImportDialogStore((store) => store.count);
  const close = useImportDialogStore((store) => store.close);
  return (
    <>
      {start === null ? null : (
        <ImportDialog
          key={count}
          environmentId={props.environmentId}
          start={start}
          onClose={close}
        />
      )}
      <RestoreDialogHost environmentId={props.environmentId} />
    </>
  );
}

/**
 * Import: scan, pick projects, sort loose files. Nothing is moved; a project stays its folder where
 * it is, and only loose files placed into a project are copied. The agent then works in an imported
 * folder, so the screen says so and never promises that Studio only reads.
 */
function ImportDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly start: ImportStart;
  readonly onClose: () => void;
}) {
  const { environmentId, start, onClose } = props;
  const bridge = readStudioImport();
  const studioProjects = useStudioProjects(environmentId);
  const trashed = useTrashedProjects(environmentId);
  // Studio's projects' folders, in Trash too (Restore brings one back), not every folder the
  // server knows: one whose project was deleted forever keeps its folder known, and is offered
  // here again.
  const known = new Set(
    [...Object.values(studioProjects), ...Object.values(trashed)].flatMap((project) =>
      project.folders.map(studioFolderKey),
    ),
  );
  const runImport = useImportProjects(environmentId);
  const handleNewThread = useNewThreadHandler();
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const [step, setStep] = useState<"scan" | "found" | "sort">(
    start.kind === "scan" ? "scan" : "found",
  );
  const [roots, setRoots] = useState<
    ReadonlyArray<{ readonly label: string; readonly path: string; readonly checked: boolean }>
  >([]);
  const [scans, setScans] = useState<ReadonlyArray<ScannedRoot>>(
    start.kind === "files" ? start.files.map((file) => ({ root: file.path, files: [file] })) : [],
  );
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanned, setScanned] = useState(start.kind === "files");
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [placements, setPlacements] = useState<ReadonlyMap<string, number | "new" | null>>(
    new Map(),
  );
  // Null until typed: the loose files' new project is named by its one file, else "Imported files".
  const [typedName, setTypedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootsAreProjects = start.kind !== "scan";

  // The folders a first scan offers: Documents, Desktop and Downloads.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the desktop bridge (IPC) for the folders to offer, dropping a reply that lands after unmount
  useEffect(() => {
    if (start.kind !== "scan" || bridge === null) return;
    let cancelled = false;
    void bridge.roots().then((found) => {
      if (!cancelled) setRoots(found.map((root) => ({ ...root, checked: true })));
    });
    return () => {
      cancelled = true;
    };
  }, [start.kind, bridge]);

  // Files or folders dropped or picked are read at once.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scans the dropped paths through the desktop bridge (IPC) on open, stopping when the dialog closes
  useEffect(() => {
    if (start.kind !== "paths" || bridge === null) return;
    let cancelled = false;
    void (async () => {
      const results: ScannedRoot[] = [];
      for (const path of start.paths) {
        if (cancelled) return;
        setScanning(baseName(path));
        results.push(await bridge.scan(path).catch(() => NOTHING_FOUND(path)));
      }
      if (cancelled) return;
      setScans(results);
      setScanning(null);
      setScanned(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [start, bridge]);

  const scanFolders = async () => {
    if (bridge === null) return;
    const chosen = roots.filter((root) => root.checked);
    const results: ScannedRoot[] = [];
    for (const root of chosen) {
      setScanning(root.label);
      results.push(await bridge.scan(root.path).catch(() => NOTHING_FOUND(root.path)));
      setScans([...results]);
    }
    setScanning(null);
    setScanned(true);
    rememberScan({ roots: chosen.map((root) => root.path), at: Date.now() });
  };

  const addFolder = async () => {
    const picked = await window.desktopBridge?.pickFolder?.();
    if (!picked) return;
    setRoots((current) =>
      current.some((root) => root.path === picked)
        ? current
        : [...current, { label: baseName(picked), path: picked, checked: true }],
    );
  };

  const plan = planImport(scans, known, { rootsAreProjects });
  const allFiles = scans.flatMap((scan) => scan.files);
  // Dropped or picked things have no scanned folder around them: they are named by their parent.
  const scannedRoots = rootsAreProjects ? [] : scans.map((scan) => scan.root);
  const counts = countByKind(allFiles);
  const look = needsALook(plan.projects.flatMap((project) => project.files));
  const lookCount = look.duplicates.length + look.oldVersions.length;
  const chosen = plan.projects.filter((project) => !excluded.has(project.folder));
  const placementOf = (file: ImportFile): number | "new" | null =>
    placements.has(file.path)
      ? (placements.get(file.path) ?? null)
      : (suggestProject(file.path, plan.projects) ?? (rootsAreProjects ? "new" : null));
  const placed = plan.loose.map((file) => {
    const to = placementOf(file);
    if (typeof to !== "number") return { file, to };
    const index = chosen.indexOf(plan.projects[to]!);
    return { file, to: index === -1 ? null : index };
  });
  const makesNew = placed.some((entry) => entry.to === "new");
  const total = chosen.length + (makesNew ? 1 : 0);
  const newFiles = placed.filter((entry) => entry.to === "new").map((entry) => entry.file);
  const onlyNew = newFiles.length === 1 ? newFiles[0] : undefined;
  const newProjectName =
    typedName ?? (onlyNew === undefined ? "Imported files" : partLabel(onlyNew.path));

  // What the import brings in when it makes one project: that project's files, or the loose ones.
  const importedPaths = (chosen.length === 1 ? chosen[0]!.files : newFiles).map(
    (file) => file.path,
  );

  const finish = async () => {
    if (busy || total === 0) return;
    setBusy(true);
    try {
      const { made, first } = await runImport({
        projects: chosen,
        placements: placed,
        newProjectName,
      });
      toastManager.add(
        made > 0
          ? {
              type: "success",
              title: `Imported ${plural(made, "project", "projects")}`,
              description:
                "Your files stay where they are. Changes the agent makes are made to them there.",
            }
          : {
              type: "error",
              title: "Nothing was imported",
              description: "Studio could not add those folders.",
            },
      );
      if (made > 0) onClose();
      // The first project imported opens on its part, as a project opens from Home.
      if (first !== null) {
        const projectRef = scopeProjectRef(environmentId, first);
        const project = await waitForProject(projectRef).catch(() => null);
        const draft = project === null ? null : await handleNewThread(projectRef).catch(() => null);
        if (draft !== null) {
          const threadRef = scopeThreadRef(environmentId, draft.threadId);
          showProject(threadRef);
          // One part brought in opens on its own, as a CAD tool opens the STEP it imports.
          const part = total === 1 ? importedToOpen(importedPaths) : null;
          if (part !== null) openFromOverview(plugins, threadRef, part);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const destinationLabel = (to: number | "new" | null) =>
    to === null
      ? "Leave out"
      : to === "new"
        ? "A new project"
        : (plan.projects[to]?.name ?? "Leave out");

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogPopup className="max-w-3xl">
        {bridge === null ? (
          <DialogHeader>
            <DialogTitle>Import works in the Studio app</DialogTitle>
            <DialogDescription>
              Open Studio on your computer to scan its folders and import files.
            </DialogDescription>
          </DialogHeader>
        ) : step === "scan" ? (
          <>
            <DialogHeader>
              <DialogTitle>Import what you already have</DialogTitle>
              <DialogDescription>
                Studio scans the folders you pick for engineering files: CAD models, drawings, parts
                lists, datasheets and photos of parts. It groups them into projects. Your files stay
                where they are. Studio works in each project's own folder: changes the agent makes
                are made to your files there.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="grid gap-6 md:grid-cols-2">
                <section aria-label="Where to look" className="flex min-w-0 flex-col">
                  <h3 className={`${MODULE_HEADING} border-b border-border pb-2`}>Where to look</h3>
                  <ul className="flex flex-col">
                    {roots.map((root) => {
                      const found = scans.find((scan) => scan.root === root.path);
                      return (
                        <li
                          key={root.path}
                          className="flex items-center gap-3 border-b border-border py-2"
                        >
                          <Checkbox
                            checked={root.checked}
                            disabled={scanning !== null}
                            aria-label={`Scan ${root.label}`}
                            onCheckedChange={(checked) =>
                              setRoots((current) =>
                                current.map((entry) =>
                                  entry.path === root.path
                                    ? { ...entry, checked: checked === true }
                                    : entry,
                                ),
                              )
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {root.label}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {scanning === root.label
                              ? "Scanning now"
                              : found === undefined
                                ? ""
                                : `${found.files.length} found`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={scanning !== null}
                      onClick={() => void addFolder()}
                    >
                      <FolderPlusIcon />
                      Add a folder or a drive
                    </Button>
                  </div>
                </section>
                <section
                  aria-label="Found so far"
                  className="flex min-w-0 flex-col gap-3 rounded-lg bg-muted/50 p-3"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {scanning !== null ? <Spinner size="sm" /> : null}
                    {scanning !== null
                      ? `Scanning ${scanning}`
                      : scanned
                        ? "Scan done"
                        : "Found so far"}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {KIND_LABELS.map(([kind, label]) => (
                      <div key={kind} className="rounded-lg bg-background px-3 py-2">
                        <div className="text-lg font-semibold text-foreground tabular-nums">
                          {counts[kind]}
                        </div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                  {scans.length === 0 ? null : (
                    <p className="text-sm font-medium text-foreground">
                      It looks like {plural(plan.projects.length, "project", "projects")} so far
                    </p>
                  )}
                </section>
              </div>
            </DialogPanel>
            <DialogFooter>
              <span className="me-auto self-center text-xs text-muted-foreground">
                Scanning only reads your files. Nothing is moved, renamed or deleted.
              </span>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Skip for now
              </Button>
              {scanned ? (
                <Button size="sm" onClick={() => setStep("found")}>
                  Continue
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={scanning !== null || !roots.some((root) => root.checked)}
                  onClick={() => void scanFolders()}
                >
                  Scan
                </Button>
              )}
            </DialogFooter>
          </>
        ) : step === "found" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {scanning !== null
                  ? `Reading ${scanning}`
                  : `${plural(total, "project", "projects")}, from ${plural(allFiles.length, "file", "files")}`}
              </DialogTitle>
              <DialogDescription>
                Each brings its models, drawings, parts lists and photos together. Uncheck any you
                don't want. Studio works in each project's own folder: changes the agent makes are
                made to your files there.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="grid gap-3 sm:grid-cols-2">
                {plan.projects.map((project) => (
                  <label
                    key={project.folder}
                    className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <Checkbox
                      checked={!excluded.has(project.folder)}
                      onCheckedChange={(checked) =>
                        setExcluded((current) => {
                          const next = new Set(current);
                          if (checked === true) next.delete(project.folder);
                          else next.add(project.folder);
                          return next;
                        })
                      }
                    />
                    <FoundPicture
                      environmentId={environmentId}
                      folder={project.folder}
                      files={project.files}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {project.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {describeCounts(project.files)}
                      </span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="truncate text-xs text-muted-foreground">
                              In {placeName(project.folder, scannedRoots)}
                            </span>
                          }
                        />
                        <TooltipPopup>{project.folder}</TooltipPopup>
                      </Tooltip>
                    </span>
                  </label>
                ))}
                {makesNew ? (
                  <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border p-3">
                    <Input
                      size="sm"
                      aria-label="New project name"
                      value={newProjectName}
                      onChange={(event) => setTypedName(event.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">
                      A new project, with {describeCounts(newFiles)}
                    </span>
                  </div>
                ) : null}
              </div>
              {plan.projects.length === 0 && plan.loose.length === 0 && scanning === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No CAD models or drawings found there that Studio doesn't have already.
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {plan.loose.length === 0 ? null : (
                  <Button variant="link" size="sm" onClick={() => setStep("sort")}>
                    {plan.loose.length === 1
                      ? "1 file is in no project"
                      : `${plan.loose.length} files are in no project`}
                  </Button>
                )}
                {lookCount === 0 ? null : (
                  <Button variant="link" size="sm" onClick={() => setStep("sort")}>
                    {lookCount === 1 ? "1 file needs a look" : `${lookCount} files need a look`}
                  </Button>
                )}
              </div>
            </DialogPanel>
            <DialogFooter>
              <span className="me-auto self-center text-xs text-muted-foreground">
                You can import more any time from Home.
              </span>
              {start.kind === "scan" ? (
                <Button variant="ghost" size="sm" onClick={() => setStep("scan")}>
                  Back
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                disabled={busy || total === 0 || scanning !== null}
                onClick={() => void finish()}
              >
                {`Import ${plural(total, "project", "projects")}`}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Sort files</DialogTitle>
              <DialogDescription>
                Studio proposes where each loose file goes; a file placed in a project is copied
                into its folder. Copies and older versions stay where they are.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              {plan.loose.length === 0 ? null : (
                <section aria-label="In no project" className="flex flex-col">
                  <h3 className={`${MODULE_HEADING} border-b border-border pb-2`}>In no project</h3>
                  <ul className="flex flex-col">
                    {plan.loose.map((file) => {
                      const to = placementOf(file);
                      return (
                        <li
                          key={file.path}
                          className="flex flex-wrap items-center gap-3 border-b border-border py-2"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm text-foreground">
                              {baseName(file.path)}
                            </span>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span className="truncate text-xs text-muted-foreground">
                                    In {placeName(file.path, scannedRoots)}
                                  </span>
                                }
                              />
                              <TooltipPopup>{file.path}</TooltipPopup>
                            </Tooltip>
                          </span>
                          <span className="text-xs text-muted-foreground">Goes to</span>
                          <Select
                            value={String(to)}
                            onValueChange={(value) =>
                              setPlacements((current) =>
                                new Map(current).set(
                                  file.path,
                                  value === "new" ? "new" : value === "null" ? null : Number(value),
                                ),
                              )
                            }
                          >
                            <SelectTrigger size="sm" className="w-48" aria-label="Goes to">
                              <SelectValue>{destinationLabel(to)}</SelectValue>
                            </SelectTrigger>
                            <SelectPopup alignItemWithTrigger={false}>
                              {plan.projects.map((project, index) => (
                                <SelectItem
                                  key={project.folder}
                                  hideIndicator
                                  value={String(index)}
                                >
                                  {project.name}
                                </SelectItem>
                              ))}
                              <SelectItem hideIndicator value="new">
                                A new project
                              </SelectItem>
                              <SelectItem hideIndicator value="null">
                                Leave out
                              </SelectItem>
                            </SelectPopup>
                          </Select>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {lookCount === 0 ? null : (
                <section aria-label="Needs a look" className="mt-5 flex flex-col">
                  <h3 className={`${MODULE_HEADING} border-b border-border pb-2`}>Needs a look</h3>
                  <ul className="flex flex-col">
                    {[
                      ...look.duplicates.map((file) => ({ file, why: "A copy of a newer file" })),
                      ...look.oldVersions.map((file) => ({ file, why: "An older version" })),
                    ].map(({ file, why }) => (
                      <li
                        key={file.path}
                        className="flex items-center gap-3 border-b border-border py-2"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm text-foreground">
                            {baseName(file.path)}
                          </span>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="truncate text-xs text-muted-foreground">
                                  In {placeName(file.path, scannedRoots)}
                                </span>
                              }
                            />
                            <TooltipPopup>{file.path}</TooltipPopup>
                          </Tooltip>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{why}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </DialogPanel>
            <DialogFooter>
              <Button size="sm" onClick={() => setStep("found")}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
