import type { EnvironmentId, InstalledPlugin } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { Link, useLocation } from "@tanstack/react-router";
import { FilePlusIcon, FolderOpenIcon } from "lucide-react";
import { lazy, type ReactNode, Suspense, useId, useState } from "react";

import { cn } from "~/lib/utils";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
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
import { DISCIPLINE_ICONS, templateIcon, templateTint } from "./kinds";
import {
  entryOfTemplate,
  librarySkills,
  ownTemplateEntries,
  skillName,
} from "./library/libraryCatalog";
import { libraryHref } from "./library/librarySearch";
import { NeedsSkill } from "./library/NeedsSkill";
import { SeeTheExample } from "./library/SeeTheExample";
import type { Availability } from "./library/skillAvailability";
import { useEntryExample } from "./library/useSampleProject";
import { partLabel } from "./partNames";
import { useEngineeringInterface } from "./studioInterface";
import { useStudioProjectAt } from "./useStudioProjects";
import {
  DISCIPLINES,
  type Discipline,
  type NewTemplate,
  type TemplateOffer,
  fileStem,
  isDocumentTemplate,
  newWorkPrompt,
} from "./newTemplates";

/**
 * A template's example, as the library pictures it. Loaded the first time New shows one, since it
 * brings the sample project's pictures and pages with it.
 */
const LibraryPicture = lazy(() =>
  import("./library/LibraryPicture").then((module) => ({ default: module.LibraryPicture })),
);

/** What New starts in each discipline, as its description names it. */
const STARTS: Readonly<Record<Discipline, string>> = {
  CAD: "a part",
  Electronics: "a board",
  Analysis: "a study",
  Manufacturing: "a manufacturing job",
  Robotics: "a robot description",
  Documents: "a document",
};

/** New's work, as Create hands it on: what to start, its name and units, and the job in words. */
export interface NewJob {
  readonly template: NewTemplate;
  readonly name: string;
  readonly units: "mm" | "in";
  /** The job for the agent (`newWorkPrompt`). */
  readonly prompt: string;
}

/** New's Part, made at once rather than handed on: its name and folder, in a project. */
export interface NewPart {
  readonly name: string;
  readonly folder: string;
}

/** How the panel names what follows: a field's label, or What it covers over its list. */

function Field(props: {
  readonly label: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
      <label htmlFor={props.htmlFor} className={MODULE_HEADING}>
        {props.label}
      </label>
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

/**
 * The top of New's panel for a template: its example as the library pictures it, What it covers
 * (a built-in document's sections), and See the example, which opens the page of the example
 * its example is in, where the server ships it. One that can't be made now first says which skill
 * it needs and why.
 */
function TemplatePreview(props: {
  readonly template: NewTemplate;
  readonly environmentId: EnvironmentId;
  /** The skill it needs before it can be made; null when it can be. */
  readonly needs: Extract<Availability, { on: false }> | null;
  /** The id that sentence takes, which Create points to. */
  readonly needsId: string;
  readonly plugins: ReadonlyArray<InstalledPlugin>;
  /** The example opened: New steps aside for it. */
  readonly onExampleOpened: () => void;
}) {
  const { template, needs } = props;
  const entry =
    template.file === undefined
      ? entryOfTemplate(template.id)
      : (ownTemplateEntries([template])[0] ?? null);
  const example = entry?.example ?? null;
  const sampleId = useEntryExample(props.environmentId, entry?.exampleIn ?? null);
  if (entry === null && needs === null && template.outline === undefined) return null;

  return (
    <div className="flex flex-col gap-3">
      {entry === null ? null : (
        // A glimpse of the example: What it covers and See the example say it in words.
        <div aria-hidden="true" className="w-full">
          <Suspense fallback={<div className="aspect-[8/5] rounded-lg border border-border" />}>
            <LibraryPicture
              entry={entry}
              environmentId={props.environmentId}
              className="rounded-lg border border-border"
            />
          </Suspense>
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-3">
        {needs === null ? null : (
          <NeedsSkill
            id={props.needsId}
            needs={needs}
            plugins={props.plugins}
            className="text-xs"
          />
        )}
        {template.outline === undefined ? null : (
          <div className="flex flex-col gap-1.5">
            <h3 className={MODULE_HEADING}>What it covers</h3>
            <ol className="flex list-decimal flex-col gap-0.5 ps-4 text-xs text-foreground marker:text-muted-foreground">
              {template.outline.map((section) => (
                <li key={section}>{section}</li>
              ))}
            </ol>
          </div>
        )}
        {example === null || sampleId === null ? null : (
          <SeeTheExample
            sampleId={sampleId}
            file={example}
            size="sm"
            onOpened={props.onExampleOpened}
          />
        )}
      </div>
    </div>
  );
}

/** The Toolbox, open on what New makes; its Make one comes back to this page's New. */
function BrowseLibrary(props: { readonly onBrowse: () => void }) {
  const here = useLocation({ select: (location) => location.href });
  return (
    <div className="flex flex-col sm:me-auto">
      <Button
        variant="ghost"
        size="sm"
        render={<Link {...libraryHref({ group: "New", from: here })} />}
        onClick={props.onBrowse}
      >
        Browse the Toolbox
      </Button>
    </div>
  );
}

/**
 * New work across disciplines, like a CAD system's New dialog. A template whose skill is off shows
 * dimmed and names the skill. Create hands the job on (`onCreate`); Part skips the agent and makes
 * the part at once (`onNewPart`), named "Untitled part" on Home until renamed.
 */
export function NewDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  /** New's templates, each on or naming the skill it needs (`templateOffers`). */
  readonly offers: ReadonlyArray<TemplateOffer>;
  /** The person's own document templates, offered under Documents. */
  readonly fileTemplates?: ReadonlyArray<NewTemplate>;
  /** Adds a template file (the desktop app's picker); null where it cannot. */
  readonly onAddTemplate?: (() => Promise<void>) | null;
  /** Shows the templates folder in Finder; null where it cannot. */
  readonly onShowTemplates?: (() => Promise<void>) | null;
  readonly initialTemplateId: string | null;
  /** The discipline it opens on, else the first template's. */
  readonly initialDiscipline?: Discipline;
  /** The project's parts, for a template that works from one. */
  readonly parts: ReadonlyArray<string>;
  /** On Home: Create makes a new project for the work, and the dialog says so. */
  readonly newProject?: boolean;
  /** Create: the work to start, for the host to hand to the agent; the dialog waits while it runs. */
  readonly onCreate: (job: NewJob) => void | Promise<unknown>;
  /** Create on Part: the part made, as New part makes it; the dialog waits while it runs. */
  readonly onNewPart: (part: NewPart) => Promise<unknown>;
}) {
  const id = useId();
  const plugins = useEnvironmentQuery(
    pluginEnvironment.list({ environmentId: props.environmentId, input: {} }),
  ).data?.plugins;
  const skills = librarySkills(plugins ?? []);
  const fileTemplates = props.fileTemplates ?? [];
  // The person's own templates need no skill.
  const offers = [
    ...props.offers,
    ...fileTemplates.map((template) => ({ template, availability: { on: true } as const })),
  ];
  const templates = offers.map((offer) => offer.template);
  // It opens on the template asked for, else the first that can be made now, in the discipline
  // asked for if any.
  const firstOn = (list: ReadonlyArray<TemplateOffer>) =>
    (list.find((offer) => offer.availability.on) ?? list[0])?.template;
  const initial =
    templates.find((template) => template.id === props.initialTemplateId) ??
    (props.initialDiscipline === undefined
      ? undefined
      : firstOn(offers.filter((offer) => offer.template.discipline === props.initialDiscipline))) ??
    firstOn(offers) ??
    null;
  const [selected, setSelected] = useState<NewTemplate | null>(initial);
  const [discipline, setDiscipline] = useState<Discipline>(
    props.initialDiscipline ?? initial?.discipline ?? "CAD",
  );
  const brief = useStudioProjectAt(props.environmentId, props.cwd)?.project.brief ?? null;
  const [name, setName] = useState(initial?.defaultName ?? "");
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [units, setUnits] = useState<"mm" | "in">(brief?.units ?? "mm");
  const [part, setPart] = useState<string | null>(props.parts[0] ?? null);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const pick = (template: NewTemplate) => {
    setSelected(template);
    setName(template.defaultName);
    setFolder(template.folder);
  };
  const offered = DISCIPLINES.filter(
    (entry) =>
      templates.some((template) => template.discipline === entry) ||
      (entry === "Documents" && props.onAddTemplate),
  );
  // What New can start now; Documents always can, as they need no skill.
  const starts = offered
    .filter(
      (entry) =>
        entry === "Documents" ||
        offers.some((offer) => offer.availability.on && offer.template.discipline === entry),
    )
    .map((entry) => STARTS[entry]);
  const startLine =
    starts.length < 2 ? starts.join("") : `${starts.slice(0, -1).join(", ")} or ${starts.at(-1)}`;
  // The skill the selected template needs before it can be made; null when it can be.
  const chosen = offers.find((offer) => offer.template.id === selected?.id);
  const needs = chosen === undefined || chosen.availability.on ? null : chosen.availability;
  const needsPart = selected?.source === "from-part";
  const writesDocument = selected !== null && isDocumentTemplate(selected);
  // New part: nothing for the agent, so no units or words; on Home, nothing to fill in at all.
  const isPart = selected?.id === "part";
  const named = !needsPart && !(isPart && props.newProject);
  // A part by its name in the engineering interface, by its path with code tools on.
  const plainWords = useEngineeringInterface();
  const partShown = (path: string) => (plainWords ? partLabel(path) : path);
  const ready =
    selected !== null &&
    needs === null &&
    (needsPart ? part !== null : !named || name.trim() !== "") &&
    !creating;

  const create = () => {
    if (selected === null || needs !== null || creating) return;
    const started = isPart
      ? props.onNewPart({ name, folder })
      : props.onCreate({
          template: selected,
          name,
          units,
          prompt: newWorkPrompt({
            template: selected,
            name,
            folder,
            units,
            part: part === null ? null : serializeComposerFileLink(part),
            description,
            ...(selected.file === undefined
              ? {}
              : { templateLink: serializeComposerFileLink(selected.file) }),
          }),
        });
    // A new project takes a moment to make: Create says so until its chat opens.
    if (started instanceof Promise) {
      setCreating(true);
      void started.finally(() => {
        setCreating(false);
        props.onOpenChange(false);
      });
    } else {
      props.onOpenChange(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>New</DialogTitle>
          <DialogDescription>
            {starts.length === 0
              ? ""
              : `Start ${startLine}${props.newProject ? " in a new project" : ""}. `}
            {isPart ? "Create opens it with the CAD tools." : "Create hands it to the agent."} To
            work on a part you already have, use the Toolbox.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-4 border-t border-border pt-3 md:grid-cols-[8rem_minmax(0,1fr)_18rem]">
            <nav aria-label="Disciplines" className="flex gap-1 overflow-x-auto md:flex-col">
              {offered.map((entry) => {
                const Icon = DISCIPLINE_ICONS[entry];
                return (
                  <button
                    key={entry}
                    type="button"
                    aria-current={discipline === entry}
                    onClick={() => setDiscipline(entry)}
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      discipline === entry
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {entry}
                  </button>
                );
              })}
            </nav>
            <div className="flex min-w-0 flex-col gap-4">
              <div
                role="listbox"
                aria-label="Templates"
                className="grid gap-2 sm:grid-cols-2 md:grid-cols-1"
              >
                {offers
                  .filter((offer) => offer.template.discipline === discipline)
                  .map(({ template, availability }) => {
                    const Icon = templateIcon(template);
                    const active = selected?.id === template.id;
                    // One that can't be made now is dimmed: grey, its panel saying why.
                    return (
                      <button
                        key={template.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => pick(template)}
                        className={cn(
                          "flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-foreground/25",
                        )}
                      >
                        <Icon
                          className={cn("mt-0.5 size-4 shrink-0", templateTint(template))}
                          aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              availability.on ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {template.label}
                          </span>
                          <span className="text-xs leading-snug text-muted-foreground">
                            {template.description}
                          </span>
                          {availability.on ? null : (
                            <span className="sr-only">
                              Needs the {skillName(availability.skill, skills)} skill
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
              </div>
              {discipline === "Documents" && (props.onAddTemplate || props.onShowTemplates) ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Your own formats, such as a client's PRD:</span>
                  {props.onAddTemplate ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void props.onAddTemplate?.()}
                    >
                      <FilePlusIcon />
                      Add a template
                    </Button>
                  ) : null}
                  {props.onShowTemplates ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void props.onShowTemplates?.()}
                    >
                      <FolderOpenIcon />
                      Templates folder
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {selected === null ? null : (
              <div className="flex min-w-0 flex-col gap-2.5 border-t border-border pt-3 md:border-s md:border-t-0 md:ps-4 md:pt-0">
                <TemplatePreview
                  key={selected.id}
                  template={selected}
                  environmentId={props.environmentId}
                  needs={needs}
                  needsId={`${id}-needs`}
                  plugins={plugins ?? []}
                  onExampleOpened={() => props.onOpenChange(false)}
                />
                {needsPart ? (
                  <Field label="Part">
                    {props.parts.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No parts in this project yet. Start with a part.
                      </span>
                    ) : (
                      <Select value={part ?? ""} onValueChange={(value) => setPart(value || null)}>
                        <SelectTrigger size="sm" className="w-full" aria-label="Part">
                          <SelectValue>
                            {part === null ? "Choose a part" : partShown(part)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectPopup alignItemWithTrigger={false}>
                          {props.parts.map((path) => (
                            <SelectItem key={path} hideIndicator value={path}>
                              {partShown(path)}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    )}
                  </Field>
                ) : !named ? null : (
                  <>
                    <Field label="Name" htmlFor={`${id}-name`}>
                      <Input
                        id={`${id}-name`}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </Field>
                    {/* Where the file goes is the agent's to keep tidy in Studio. */}
                    {plainWords ? null : (
                      <Field label="Folder" htmlFor={`${id}-folder`}>
                        <Input
                          id={`${id}-folder`}
                          value={folder}
                          onChange={(event) => setFolder(event.target.value)}
                        />
                      </Field>
                    )}
                  </>
                )}
                {writesDocument || isPart ? null : (
                  <Field label="Units">
                    <Select
                      value={units}
                      onValueChange={(value) => setUnits(value === "in" ? "in" : "mm")}
                    >
                      <SelectTrigger size="sm" className="w-full" aria-label="Units">
                        <SelectValue>{units === "in" ? "Inches" : "Millimeters"}</SelectValue>
                      </SelectTrigger>
                      <SelectPopup alignItemWithTrigger={false}>
                        <SelectItem hideIndicator value="mm">
                          Millimeters
                        </SelectItem>
                        <SelectItem hideIndicator value="in">
                          Inches
                        </SelectItem>
                      </SelectPopup>
                    </Select>
                  </Field>
                )}
                {isPart ? null : (
                  <Field label="What it is" htmlFor={`${id}-description`}>
                    <Textarea
                      id={`${id}-description`}
                      size="sm"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={
                        writesDocument
                          ? "Anything it should say, or leave out"
                          : needsPart
                            ? "Anything the agent should know: loads, machine, finish"
                            : "Size, features, what it attaches to"
                      }
                    />
                  </Field>
                )}
                {/* A part's file is the next name free in its folder, known once it is made. */}
                {plainWords || !named || isPart || name.trim() === "" ? null : (
                  <p className="text-xs text-muted-foreground">
                    Saved as {(folder.trim() || selected.folder).replace(/\/+$/, "")}/
                    {fileStem(name)}
                    {writesDocument ? ".md" : ""}
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <BrowseLibrary onBrowse={() => props.onOpenChange(false)} />
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          {/* One that can't be made now: Create is off, and the panel's sentence says why. */}
          <Button
            size="sm"
            onClick={create}
            disabled={!ready}
            aria-describedby={needs === null ? undefined : `${id}-needs`}
          >
            {creating ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
