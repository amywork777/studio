import type {
  EnvironmentId,
  ScopedProjectRef,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { studioFolderName } from "@t3tools/shared/studioProjects";
import { CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { CheckBadge, CHECK_STATUS as STATUS, OutOfDateIcon } from "./CheckBadge";
import {
  type CheckIssue,
  type CheckResult,
  type CheckStatus,
  checkOutOfDate,
  claimStudies,
  currentResults,
  drawingsFor,
  manufacturingFor,
  overviewParts,
  proposeFixPrompt,
  resultsFor,
  worstStatus,
} from "./checkResults";
import { KIND_ICONS } from "./kinds";
import { humanName, partName } from "./partNames";
import { leadPartOf } from "./leadPart";
import { buildLabel, materialLabel } from "./partLabels";
import { folderFiles, pictureVersions } from "./projectModels";
import { PageTitle } from "./PageTitle";
import { type FolderPart, MadeBadges, PartFooter, PartIcon } from "./PartBadges";
import { CARD_GRID, GROUP_LABEL, MODULE_HEADING, SECTION_STACK } from "./studioLayout";
import {
  FileCard,
  FilesModule,
  HeadingLink,
  OverviewModule,
  ShowAll,
  StartModule,
  useFoldedModules,
} from "./OverviewModules";
import {
  DESIGN_GROUPS,
  filePlaces,
  groupProjectFiles,
  PROJECT_GROUPS,
  type ProjectFile,
  type ProjectGroup,
} from "./projectFiles";
import { PartVersions, type VersionedPart } from "./PartVersions";
import { ProjectEverything } from "./ProjectEverything";
import { ProjectSizes } from "./ProjectSizes";
import { ProjectThreads } from "./ProjectThreads";
import { useEngineeringInterface } from "./studioInterface";
import { TITLE_TONE } from "./TitleBlock";
import { usePartContext } from "./usePartContext";
import { usePictures } from "./usePictures";
import { useProjectChecks } from "./useProjectChecks";
import { useProjectModels } from "./useFolderModels";
import { projectChats } from "./workspaceTitle";

const STATUS_ORDER: Record<CheckStatus | "none", number> = {
  fix: 0,
  warnings: 1,
  ready: 2,
  none: 3,
};
/** The overview shows this many issues and threads before "Show all". */
const FIRST_ISSUES = 5;
const RECENT_THREADS = 5;

const sentenceCase = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

interface Issue {
  readonly root: string;
  readonly result: CheckResult;
  readonly issue: CheckIssue;
  /** The part it was found on, where the folder holds it. */
  readonly part: ProjectFile | null;
}

/** How an issue names its part: the part's own name, else the name its result gives. */
const issuePart = (entry: Issue) =>
  entry.part?.title ?? partName(entry.result.part)?.name ?? humanName(entry.result.part);

/** The icon of how a part's checks went, in its status color. */
const STATUS_TONE: Record<CheckStatus, string> = {
  fix: "text-destructive",
  warnings: "text-warning-foreground",
  ready: "text-success-foreground",
};

/** One of the lead part's facts: its label, then its value, on the row under the picture. */
function LeadFact(props: {
  readonly label: string;
  /** Its value says what it is, so the label is for readers only. */
  readonly labelHidden?: boolean;
  readonly tone?: keyof typeof TITLE_TONE;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className={cn("shrink-0 text-xs text-muted-foreground", props.labelHidden && "sr-only")}>
        {props.label}
      </dt>
      <dd className={cn("min-w-0 text-xs font-medium", TITLE_TONE[props.tone ?? "default"])}>
        {props.children}
      </dd>
    </div>
  );
}

/**
 * The lead part's facts, under its picture: only what it already carries. The viewer says more of
 * the part it has open: its material, and a build under way.
 */
function LeadFacts(props: {
  readonly part: FolderPart;
  readonly threadRef: ScopedThreadRef;
  /** How the project's sizes are written, until the viewer says how it reads the part. */
  readonly units: string;
  /** Opens a check's result, by its path in the part's folder. */
  readonly onOpenFile: (path: string) => void;
}) {
  const { part } = props;
  useNowMinute();
  const shown = usePartContext(props.threadRef)?.part ?? null;
  const facts =
    shown?.path === (part.file.document ?? `${part.root.replace(/[\\/]+$/, "")}/${part.file.path}`)
      ? shown
      : null;
  const material = facts === null ? null : materialLabel(facts.materials);
  const build = buildLabel(
    facts?.build ??
      (part.file.version === undefined
        ? null
        : { state: "built", at: Number(part.file.version) * 1000 }),
  );
  // With every check out of date they stand under the amber line above (`LeadPart`), not here too.
  const checks = part.results.length === 0 ? [] : [...part.results, ...part.outdated];
  return (
    <dl className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
      <LeadFact label="Units">{facts?.units ?? props.units}</LeadFact>
      {material === null ? null : (
        <LeadFact label="Material" tone={material.missing ? "faint" : "default"}>
          {material.text}
        </LeadFact>
      )}
      {build === null ? null : (
        <LeadFact label="Build" labelHidden tone={build.failed ? "error" : "default"}>
          {build.text}
        </LeadFact>
      )}
      {checks.length === 0 ? null : (
        <LeadFact label="Checks">
          <span className="flex min-w-0 flex-wrap gap-1">
            {checks.map((result) => (
              <CheckBadge
                key={result.path}
                result={result}
                outOfDate={checkOutOfDate(result, part.file)}
                onOpen={() => props.onOpenFile(result.model)}
              />
            ))}
          </span>
        </LeadFact>
      )}
    </dl>
  );
}

/**
 * The project's lead part, large (`leadPartOf`): its picture, how its checks went, then its facts
 * with what was made from it at their end. Its name is the page's title, over this and the README.
 */
function LeadPart(props: {
  readonly environmentId: EnvironmentId;
  readonly part: FolderPart;
  readonly threadRef: ScopedThreadRef;
  readonly units: string;
  /** Its path, with code tools on. */
  readonly where: string | undefined;
  readonly onOpen: () => void;
  /** Opens a file made from it, by its path in its folder. */
  readonly onOpenFile: (path: string) => void;
}) {
  const { part } = props;
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: part.root,
    paths: [part.file.picture ?? part.file.path],
    versions: pictureVersions([part.file]),
  });
  const picture = pictures.get(part.file.picture ?? part.file.path);
  const status = worstStatus(part.results);
  const name = part.file.title;
  const outOfDate = status === null && part.outdated.length > 0;
  const StatusIcon = status !== null ? STATUS[status].Icon : outOfDate ? OutOfDateIcon : null;
  return (
    <section aria-label="Lead part" className={SECTION_STACK}>
      <button
        type="button"
        onClick={props.onOpen}
        aria-label={`Open ${part.file.title} in the viewer`}
        className="flex aspect-[4/3] max-h-56 items-center justify-center overflow-hidden rounded-lg border border-border bg-(--model-ground) outline-none transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {picture ? (
          <img src={picture} alt="" className="size-full object-contain" />
        ) : (
          <PartIcon file={part.file} className="size-10 text-muted-foreground/50" />
        )}
      </button>
      <div className="flex min-w-0 items-start gap-1.5 text-sm text-foreground">
        {StatusIcon === null ? null : (
          <StatusIcon
            aria-hidden="true"
            className={cn("mt-0.5 size-4 shrink-0", STATUS_TONE[status ?? "warnings"])}
          />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className={outOfDate ? STATUS_TONE.warnings : undefined}>
            {status !== null
              ? `${sentenceCase(STATUS[status].caption)} on ${name}`
              : outOfDate
                ? `${name} changed since its last check`
                : `No checks run on ${name} yet`}
            {props.where === undefined ? "" : ` · ${props.where}`}
          </p>
          {outOfDate ? (
            <div className="flex min-w-0 flex-wrap gap-x-3">
              {part.outdated.map((result) => (
                <CheckBadge
                  key={result.path}
                  result={result}
                  outOfDate
                  markedOutOfDate
                  onOpen={() => props.onOpenFile(result.model)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <LeadFacts
          part={part}
          threadRef={props.threadRef}
          units={props.units}
          onOpenFile={props.onOpenFile}
        />
        {part.drawings.length + part.made.length === 0 ? null : (
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <MadeBadges part={part} onOpen={props.onOpenFile} lead />
          </div>
        )}
      </div>
    </section>
  );
}

/** What the checks found, errors first, each with the fix it suggests and a way to ask for one. */
function OpenIssues(props: {
  readonly issues: ReadonlyArray<Issue>;
  readonly checked: boolean;
  readonly composerRef: ComposerHandleRef | null;
  readonly linkTo: (root: string, path: string) => string;
  readonly onShow: (issue: Issue) => void;
  /** Brings the chat into view, where an ask is written. */
  readonly onShowChat: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? props.issues : props.issues.slice(0, FIRST_ISSUES);
  const propose = (entry: Issue) => {
    const composer = props.composerRef?.current;
    if (!composer) return;
    // The ask is written into the chat: the Overview steps back beside it, so it shows.
    props.onShowChat();
    const part = entry.part === null ? undefined : props.linkTo(entry.root, entry.part.path);
    composer.insertTextAtEnd(proposeFixPrompt(entry.result, entry.issue, part), {
      ensureLeadingBoundary: true,
    });
    composer.focusAtEnd();
  };
  return (
    <section aria-label="Open issues" className={SECTION_STACK}>
      <h2 className={MODULE_HEADING}>
        Open issues
        {props.issues.length > 0 ? (
          <span className="tabular-nums text-muted-foreground">{props.issues.length}</span>
        ) : null}
      </h2>
      {props.issues.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {props.checked
            ? "Nothing open. Every check that has run passed."
            : "No checks have run yet. Open a part and use Check to run one."}
        </p>
      ) : (
        <ul className="flex flex-col border-t border-border">
          {shown.map((entry) => {
            const error = entry.issue.severity === "error";
            return (
              <li
                key={`${entry.root}\n${entry.result.path}\n${entry.issue.severity}\n${entry.issue.summary}`}
                className="flex flex-col gap-2 border-b border-border p-3"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Badge variant={error ? "error" : "warning"}>
                    {error ? (
                      <CircleXIcon aria-hidden="true" />
                    ) : (
                      <TriangleAlertIcon aria-hidden="true" />
                    )}
                    {error ? "Fails" : "Warning"}
                  </Badge>
                  <p className="min-w-0 flex-1 text-sm text-foreground">{entry.issue.summary}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {issuePart(entry)} · {entry.result.check}
                </p>
                {entry.issue.fix === null ? null : (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    <span className="text-foreground/80">Suggested fix: </span>
                    {entry.issue.fix}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {props.composerRef === null ? null : (
                    <Button size="sm" variant="outline" onClick={() => propose(entry)}>
                      Propose a fix
                    </Button>
                  )}
                  <Button size="sm" variant="ghost-muted" onClick={() => props.onShow(entry)}>
                    Show the result
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {props.issues.length > FIRST_ISSUES ? (
        <ShowAll all={all} count={props.issues.length} onToggle={() => setAll((value) => !value)} />
      ) : null}
    </section>
  );
}

/** One folder's parts, problems first, each with its checks. */
function FolderParts(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly parts: ReadonlyArray<FolderPart>;
  readonly onOpen: (root: string, path: string) => void;
}) {
  const engineering = useEngineeringInterface();
  const files = props.parts.map((part) => part.file);
  const places = engineering
    ? filePlaces(files)
    : new Map(files.map((file) => [file.path, file.path] as const));
  const pictures = usePictures({
    environmentId: props.environmentId,
    cwd: props.root,
    paths: props.parts.map((part) => part.file.picture ?? part.file.path),
  });
  return props.parts.map((part) => (
    <FileCard
      key={part.file.path}
      environmentId={props.environmentId}
      threadRef={props.threadRef}
      root={props.root}
      file={part.file}
      picture={pictures.get(part.file.picture ?? part.file.path)}
      place={places.get(part.file.path)}
      onOpen={() => props.onOpen(props.root, part.file.path)}
      footer={<PartFooter part={part} onOpen={(path) => props.onOpen(props.root, path)} />}
    />
  ));
}

/**
 * The project's overview: modules that each appear once the project holds something for them and
 * update as the agent writes files. Asking for a fix writes the ask into the composer, so the agent
 * proposes and waits. Checks are the results text-to-cad writes beside the parts
 * (`checkResults.ts`).
 */
export function ProjectOverview(props: {
  readonly environmentId: EnvironmentId;
  readonly folders: ReadonlyArray<string>;
  readonly mutationId: string | null;
  readonly composerRef: ComposerHandleRef | null;
  readonly projectRefs: ReadonlyArray<ScopedProjectRef>;
  readonly folderNames: ReadonlyMap<string, string> | null;
  readonly currentThreadId: ThreadId | null;
  readonly onOpen: (root: string, path: string) => void;
  /** A link to the file, as the composer writes one (a chip naming the part). */
  readonly linkTo: (root: string, path: string) => string;
  /** Opens the Threads tab; null where the page has none (a thread's own scratch folder). */
  readonly onShowThreads: (() => void) | null;
  /** Simple view is off: the project's parts open in the full workspace, to start one by hand. */
  readonly byHand: boolean;
  /** Starts a part to model by hand, the starter opened in CAD mode (`useAddPart`); null where it can't. */
  readonly onStartPart: (() => void) | null;
  /** The thread the Overview is beside, for the project's photos. */
  readonly threadRef: ScopedThreadRef;
  /** The project's README (`ReadmeOverview`), beside the lead part; null where none is shown. */
  readonly readme: ReactNode | null;
  /** How the project's sizes are written ("mm" or "in"), for the sizes a version changed. */
  readonly units: string;
  /** Opens New on Documents (PRD, requirements, FMEA, your own templates); null where it cannot. */
  readonly onNewDocument: (() => void) | null;
}) {
  const folderChecks = useProjectChecks({
    environmentId: props.environmentId,
    folders: props.folders,
    mutationId: props.mutationId,
  });
  // Each folder's cadgen 0.8 models, among its parts by their document ids.
  const models = useProjectModels({
    environmentId: props.environmentId,
    folders: props.folders,
    mutationId: props.mutationId,
  });
  const folders = folderChecks.map((folder) => ({
    ...folder,
    models: models.get(folder.root) ?? [],
  }));

  const { byFolder, issues, checked, reading } = (() => {
    const byFolder = folders.map((folder) => {
      const files = folderFiles(folder.paths ?? [], folder.models);
      const designs = overviewParts(files);
      const made = manufacturingFor(designs, files);
      const claimed = claimStudies(designs, folder.results);
      const results = currentResults(designs, claimed);
      const parts = designs
        .map((file) => ({
          root: folder.root,
          file,
          results: resultsFor(file, results),
          outdated: resultsFor(file, claimed).filter((result) => checkOutOfDate(result, file)),
          drawings: drawingsFor(file, folder.paths ?? []),
          made: made.get(file.path) ?? [],
        }))
        .toSorted(
          (a, b) =>
            STATUS_ORDER[worstStatus(a.results) ?? "none"] -
            STATUS_ORDER[worstStatus(b.results) ?? "none"],
        );
      return { root: folder.root, parts, results };
    });
    const issues = byFolder
      .flatMap((folder) =>
        folder.results.flatMap((result) => {
          const part = folder.parts.find((entry) => entry.results.includes(result))?.file ?? null;
          // A note about the run (a slow solve) is nothing open on the part: its result lists it.
          return result.issues
            .filter((issue) => issue.note !== true)
            .map((issue) => ({ root: folder.root, result, issue, part }));
        }),
      )
      .toSorted((a, b) =>
        a.issue.severity === b.issue.severity ? 0 : a.issue.severity === "error" ? -1 : 1,
      );
    return {
      byFolder,
      issues,
      checked: folders.some((folder) => folder.results.length > 0),
      reading: folders.some((folder) => folder.paths === null),
    };
  })();

  // Every part and board with its checks, by full path, for the list of everything.
  const partsByPath = new Map(
    byFolder.flatMap((folder) =>
      folder.parts.map(
        (part) => [`${part.root.replace(/[\\/]+$/, "")}/${part.file.path}`, part] as const,
      ),
    ),
  );
  const showChat = () => useRightPanelStore.getState().setMaximized(props.threadRef, false);
  // The lead part as its folder's parts have it, with its checks and what was made from it.
  const lead = (() => {
    const found = leadPartOf(folders);
    if (found === null) return null;
    return (
      byFolder
        .find((folder) => folder.root === found.root)
        ?.parts.find((part) => part.file.path === found.file.path) ?? null
    );
  })();
  // Every kind of file not designed, across the project's folders, in the page's order; the README
  // is read above as itself.
  const modules = (() => {
    const byGroup = new Map<ProjectGroup, Array<{ root: string; file: ProjectFile }>>();
    for (const folder of folders) {
      for (const { group, files } of groupProjectFiles(folder.paths ?? [])) {
        if (DESIGN_GROUPS.has(group)) continue;
        const kept = files.filter((file) => !/^readme\.md$/i.test(file.path));
        if (kept.length === 0) continue;
        byGroup.set(group, [
          ...(byGroup.get(group) ?? []),
          ...kept.map((file) => ({ root: folder.root, file })),
        ]);
      }
    }
    return PROJECT_GROUPS.flatMap((group) => {
      const files = byGroup.get(group);
      return files === undefined ? [] : [{ group, files }];
    });
  })();
  // The designed kinds, CAD then Electronics, each a module of its parts by folder.
  const designModules = PROJECT_GROUPS.filter((group) => DESIGN_GROUPS.has(group)).flatMap(
    (group) => {
      const inGroup = byFolder
        .map((folder) => ({
          root: folder.root,
          parts: folder.parts.filter((part) => part.file.group === group),
        }))
        .filter((folder) => folder.parts.length > 0);
      const count = inGroup.reduce((total, folder) => total + folder.parts.length, 0);
      return count === 0 ? [] : [{ group, folders: inGroup, count }];
    },
  );
  const chats = projectChats(useThreadShellsForProjectRefs(props.projectRefs));
  const otherChats = chats.filter((chat) => chat.id !== props.currentThreadId).length;
  // Every part, the lead part first, for its versions.
  const versioned = (() => {
    const all: VersionedPart[] = byFolder.flatMap((folder) => folder.parts);
    const first =
      lead === null
        ? undefined
        : all.find((entry) => entry.root === lead.root && entry.file.path === lead.file.path);
    const rest = all.filter((entry) => entry !== first);
    return first === undefined ? rest : [first, ...rest];
  })();
  const { folded, toggle } = useFoldedModules(props.folders[0] ?? "");
  const partCount = byFolder.reduce((total, folder) => total + folder.parts.length, 0);
  const engineering = useEngineeringInterface();

  return (
    <div className="@container flex min-w-0 flex-col gap-6">
      {lead === null ? (
        <>
          {props.readme}
          {reading ? (
            <p className="text-xs text-muted-foreground">Reading the project</p>
          ) : engineering ? null : (
            // Studio's way to start a part is New, in the toolbar; Files below says so.
            <StartModule byHand={props.byHand} onStartPart={props.onStartPart} />
          )}
        </>
      ) : (
        // The part first, large, with what the project is beside it, both under its name.
        <div className={SECTION_STACK}>
          <PageTitle title={lead.file.title} label={lead.file.kind} />
          <div className="grid min-w-0 items-start gap-6 @3xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <LeadPart
              environmentId={props.environmentId}
              part={lead}
              threadRef={props.threadRef}
              units={props.units}
              where={engineering ? undefined : lead.file.path}
              onOpen={() => props.onOpen(lead.root, lead.file.path)}
              onOpenFile={(path) => props.onOpen(lead.root, path)}
            />
            {props.readme === null ? (
              <OpenIssues
                issues={issues}
                checked={checked}
                composerRef={props.composerRef}
                linkTo={props.linkTo}
                onShow={(entry) => props.onOpen(entry.root, entry.result.model)}
                onShowChat={showChat}
              />
            ) : (
              props.readme
            )}
          </div>
        </div>
      )}

      {/* What the project holds, the latest first, as a Drive folder shows it (`ProjectEverything`). */}
      {engineering ? (
        <ProjectEverything
          environmentId={props.environmentId}
          threadRef={props.threadRef}
          folders={folders}
          parts={partsByPath}
          onOpenFile={props.onOpen}
        />
      ) : null}

      {props.readme !== null && (checked || issues.length > 0) ? (
        <OpenIssues
          issues={issues}
          checked={checked}
          composerRef={props.composerRef}
          linkTo={props.linkTo}
          onShow={(entry) => props.onOpen(entry.root, entry.result.model)}
          onShowChat={showChat}
        />
      ) : null}

      <div className="grid min-w-0 gap-6 @3xl:grid-cols-2">
        {versioned.length === 0 ? null : (
          <PartVersions
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            parts={versioned}
            chats={chats}
            units={props.units}
            mutationId={props.mutationId}
            folded={folded.includes("Versions")}
            onFold={() => toggle("Versions")}
            onOpen={props.onOpen}
            composerRef={props.composerRef}
          />
        )}
        {/* Every named size in one table, shared ones first (`ProjectSizes`). */}
        {partCount === 0 ? null : (
          <ProjectSizes
            environmentId={props.environmentId}
            threadRef={props.threadRef}
            folders={props.folders}
            mutationId={props.mutationId}
            composerRef={props.composerRef}
            folded={folded.includes("Sizes")}
            onFold={() => toggle("Sizes")}
          />
        )}
        {/* A project of one part shows it above, large; these are for picking among several. */}
        {engineering || partCount < 2
          ? null
          : designModules.map((module) => (
              <OverviewModule
                key={module.group}
                title={module.group}
                icon={KIND_ICONS[module.group]}
                count={module.count}
                wide
                folded={folded.includes(module.group)}
                onFold={() => toggle(module.group)}
              >
                <div className={SECTION_STACK}>
                  {module.folders.map((folder) => (
                    <div key={folder.root} className={SECTION_STACK}>
                      {module.folders.length > 1 ? (
                        <h3 className={GROUP_LABEL}>{studioFolderName(folder.root)}</h3>
                      ) : null}
                      <div className={CARD_GRID}>
                        <FolderParts
                          environmentId={props.environmentId}
                          threadRef={props.threadRef}
                          root={folder.root}
                          parts={folder.parts}
                          onOpen={props.onOpen}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </OverviewModule>
            ))}
        {modules.map(({ group, files }) =>
          engineering ? null : (
            <FilesModule
              key={group}
              environmentId={props.environmentId}
              threadRef={props.threadRef}
              group={group}
              files={files}
              folded={folded.includes(group)}
              onFold={() => toggle(group)}
              onOpen={props.onOpen}
              {...(group === "Documents" && props.onNewDocument !== null
                ? { action: <HeadingLink label="New document" onClick={props.onNewDocument} /> }
                : {})}
            />
          ),
        )}
        {engineering || props.onShowThreads === null || otherChats === 0 ? null : (
          <OverviewModule
            title="Recent work"
            wide
            folded={folded.includes("Recent work")}
            onFold={() => toggle("Recent work")}
            action={
              <button
                type="button"
                onClick={props.onShowThreads}
                className="text-xs text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:underline"
              >
                {engineering ? "Full history" : "Every thread"}
              </button>
            }
          >
            <ProjectThreads
              projectRefs={props.projectRefs}
              folderNames={props.folderNames}
              currentThreadId={props.currentThreadId}
              query=""
              limit={RECENT_THREADS}
            />
          </OverviewModule>
        )}
      </div>
    </div>
  );
}
