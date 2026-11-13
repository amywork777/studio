import { MY_SKILLS_PLUGIN_ID, type EnvironmentId, type InstalledPlugin } from "@t3tools/contracts";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { PlusIcon, PuzzleIcon, SearchIcon, UserRoundIcon } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../ui/input-group";
import { ChatPage } from "../ChatPages";
import { useDocumentTemplates } from "../documentTemplates";
import { fileTint, MENU_ICONS, MENU_TINTS, MENU_WORDS } from "../kinds";
import { useNewDialogStore } from "../newDialogStore";
import type { NewTemplate } from "../newTemplates";
import { jobOfSkill } from "../jobSkills";
import { useEngineeringInterface } from "../studioInterface";
import {
  availability,
  entryNeeds,
  findItIn,
  LIBRARY_DOCUMENTS,
  type LibraryDocument,
  type LibraryEntry,
  librarySkills,
  madeBy,
  makeOneTemplate,
  ownTemplateEntries,
  skillsBehind,
  skillName,
} from "./libraryCatalog";
import { AddSkillTile } from "./AddSkill";
import { LibraryCard } from "./LibraryCard";
import { LibraryPicture } from "./LibraryPicture";
import {
  gatherShortShelves,
  shortRowEnd,
  LibraryShelf,
  ShelfIndex,
  SHELF_GRID,
  shelfAnchor,
  type Shelf,
} from "./LibraryShelf";
import {
  documentGroup,
  filterLibrary,
  LIBRARY_GROUPS,
  type LibraryGroup,
  type LibrarySearch,
  skillGroup,
} from "./librarySearch";
import { NeedsSkill } from "./NeedsSkill";
import { SeeTheExample } from "./SeeTheExample";
import { SkillDetail } from "./SkillDetail";
import { TEXT_TO_CAD } from "./skillAvailability";
import { useExamples } from "./useSampleProject";

/** Each group of document types by its place's icon: New's, then each part menu's (`kinds.ts`). */
const GROUP_ICONS = { New: PlusIcon, ...MENU_ICONS } satisfies Record<LibraryGroup, unknown>;

/** Each group's hue: the kind it holds (`kinds.ts`). */
const GROUP_TINTS: Readonly<Record<LibraryGroup, string>> = {
  New: fileTint("CAD"),
  ...MENU_TINTS,
};

/** An entry's name: a document type's as New or the menus say it, a skill's as `skillLabel` does. */
const entryName = (entry: LibraryEntry, skillLabel: (name: string) => string) =>
  entry.kind === "document" ? entry.name : skillLabel(entry.name);

interface Group extends Shelf {
  readonly entries: ReadonlyArray<LibraryEntry>;
}

/** A shelf of what matched, with how many. */
const shelfOf = (shelf: Omit<Shelf, "count">, entries: ReadonlyArray<LibraryEntry>): Group => ({
  ...shelf,
  count: entries.length,
  entries,
});

/**
 * The Toolbox page (`/library`). The person's own skills shelf comes first once they have one,
 * last until then. An open entry is kept in the URL (`entry`) so Back closes it; `group` scrolls
 * to its shelf.
 */
export function LibraryPage(props: { readonly search: LibrarySearch }) {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : (
    <LibraryContent environmentId={environmentId} search={props.search} />
  );
}

function LibraryContent(props: {
  readonly environmentId: EnvironmentId;
  readonly search: LibrarySearch;
}) {
  const { environmentId, search } = props;
  const navigate = useNavigate();
  const router = useRouter();
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const ownTemplates = useDocumentTemplates(environmentId).templates;
  const examples = useExamples(environmentId).examples;
  const [query, setQuery] = useState("");

  const documents = [...LIBRARY_DOCUMENTS, ...ownTemplateEntries(ownTemplates)];
  const skills = librarySkills(plugins ?? []);
  const entries = [...documents, ...skills];
  const matching = new Set(filterLibrary(entries, query));
  const pluginsWithSkills = [
    ...new Map(skills.map((skill) => [skill.pluginId, skill.pluginName] as const)),
  ].filter(([pluginId]) => pluginId !== MY_SKILLS_PLUGIN_ID && pluginId !== TEXT_TO_CAD);
  const mySkills = shelfOf(
    {
      key: `plugin:${MY_SKILLS_PLUGIN_ID}`,
      title: "My skills",
      icon: UserRoundIcon,
      tint: fileTint("CAD"),
    },
    skills.filter((skill) => skill.pluginId === MY_SKILLS_PLUGIN_ID && matching.has(skill)),
  );
  const ourSkills = skills.filter((skill) => skill.pluginId === TEXT_TO_CAD);
  // What a skill makes; a job skill's is what its one job makes.
  const makes = (skill: string) => {
    const job = jobOfSkill(skill);
    return documents.filter((entry) =>
      job === null ? skillsBehind(entry).includes(skill) : entry.actions.includes(job.id),
    );
  };
  // A skill shows for its own words, or for what it makes.
  const ourShown = ourSkills.filter(
    (skill) => matching.has(skill) || makes(skill.name).some((entry) => matching.has(entry)),
  );
  // A document type lives inside the skill that makes it; only one no skill here makes is a tile.
  const onItsOwn = documents.filter(
    (entry) =>
      matching.has(entry) &&
      !skillsBehind(entry).some((skill) => ourSkills.some((own) => own.name === skill)),
  );
  const workShelves: ReadonlyArray<Group> = LIBRARY_GROUPS.map((group) =>
    shelfOf(
      {
        key: group,
        title: group === "New" ? group : MENU_WORDS[group],
        icon: GROUP_ICONS[group],
        tint: GROUP_TINTS[group],
        source: "text-to-cad",
      },
      [
        ...ourShown.filter((skill) => skillGroup(skill.name) === group),
        ...onItsOwn.filter((entry) => documentGroup(entry) === group),
      ],
    ),
  ).filter((group) => group.entries.length > 0);
  const pluginShelves: ReadonlyArray<Group> = pluginsWithSkills
    .map(([pluginId, pluginName]) =>
      shelfOf(
        {
          key: `plugin:${pluginId}`,
          title: `${pluginName} skills`,
          icon: PuzzleIcon,
          tint: fileTint("CAD"),
        },
        skills.filter((skill) => skill.pluginId === pluginId && matching.has(skill)),
      ),
    )
    .filter((group) => group.entries.length > 0);
  // My skills holds Add a skill, so it stays with nothing in it: last until the person has one.
  const haveOwn = mySkills.entries.length > 0;
  const shelves: ReadonlyArray<Group> = [
    ...(haveOwn ? [mySkills] : []),
    ...workShelves,
    ...pluginShelves,
    ...(!haveOwn && query === "" ? [mySkills] : []),
  ];
  const nothingFound = shelves.length === 0;
  const tilesOn = (group: Group) => group.entries.length + (group === mySkills ? 1 : 0);

  // Every skill on the page by its one name (`skillName`): cards, details, Made by, what it needs.
  const skillLabel = (name: string) => skillName(name, skills);
  // Under a card's name: why it can't be made now. Nothing until the plugins are known.
  const offNote = (entry: LibraryEntry) => {
    if (plugins === undefined) return null;
    if (entry.kind === "skill") return entry.on ? null : "Turned off";
    const state = availability(entry, plugins);
    return state.on ? null : `Needs the ${skillLabel(state.skill)} skill`;
  };

  const selected = entries.find((entry) => entry.id === search.entry) ?? null;
  // The entry last open, so the detail keeps its content while it closes.
  const [lastOpen, setLastOpen] = useState<string | null>(null);
  if (selected !== null && selected.id !== lastOpen) setLastOpen(selected.id);
  const shown = selected ?? entries.find((entry) => entry.id === lastOpen) ?? null;
  // Opened here, the detail closes with a step back; one a link opened leaves the history as is.
  const openedHere = useRef(false);
  const openEntry = (id: string) => {
    openedHere.current = true;
    void navigate({ to: "/library", search: { ...search, entry: id } });
  };
  const closeEntry = () => {
    if (openedHere.current) {
      openedHere.current = false;
      router.history.back();
      return;
    }
    void navigate({ to: "/library", search: { ...search, entry: undefined }, replace: true });
  };
  // New on the template, back where the library was opened from, else on Home. Offered only where
  // a New will take the ask: a page that linked here, or the engineering interface's Home.
  const engineering = useEngineeringInterface();
  const makeOne = (template: NewTemplate) => {
    useNewDialogStore.getState().ask(template.discipline, template.id);
    if (search.from === undefined) void navigate({ to: "/" });
    else void navigate({ href: search.from });
  };

  // A skill just added or copied opens on the editor.
  const [editingId, setEditingId] = useState<string | null>(null);
  const openOwnSkill = (skill: string) => {
    const id = `skill:${MY_SKILLS_PLUGIN_ID}/${skill}`;
    setEditingId(id);
    openEntry(id);
  };
  const cover = (entry: LibraryEntry) => (
    <LibraryCard
      key={entry.id}
      picture={
        <LibraryPicture
          entry={entry}
          environmentId={environmentId}
          className="aspect-square border-b border-border"
        />
      }
      name={entryName(entry, skillLabel)}
      {...(entry.kind === "skill" ? { blurb: entry.blurb } : {})}
      note={offNote(entry) ?? entryNeeds(entry)}
      onOpen={() => openEntry(entry.id)}
    />
  );

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scrolls the DOM to the shelf the URL's group names, unless it already shows near the top
  useEffect(() => {
    if (search.group === undefined) return;
    const anchor = document.getElementById(shelfAnchor(search.group));
    if (anchor === null) return;
    const top = anchor.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight / 2) anchor.scrollIntoView({ block: "start" });
  }, [search.group]);

  const placed = gatherShortShelves(shelves, tilesOn);
  const rowEnd = shortRowEnd(placed, tilesOn);

  return (
    <ChatPage
      title="Toolbox"
      count={shelves.reduce((tiles, shelf) => tiles + shelf.count, 0)}
      lede="The skills the agent works from: text-to-cad's and your own. Open one to read it and see what it makes."
      search={
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon className="size-4 text-muted-foreground opacity-100" aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            size="sm"
            placeholder="Search the Toolbox"
            aria-label="Search the Toolbox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
      }
    >
      {nothingFound ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing in the Toolbox matches that.</p>
      ) : null}
      <div className="@container min-w-0">
        <div className="flex min-w-0 items-start gap-8">
          <ShelfIndex shelves={shelves} />
          <div className="@container min-w-0 flex-1">
            <div className={SHELF_GRID}>
              {placed.map((group) => (
                <LibraryShelf
                  key={group.key}
                  shelf={group}
                  tiles={tilesOn(group)}
                  rowEnd={group === rowEnd?.shelf ? rowEnd.spans : undefined}
                >
                  {group === mySkills ? (
                    <AddSkillTile environmentId={environmentId} onAdded={openOwnSkill} />
                  ) : null}
                  {group.entries.map(cover)}
                </LibraryShelf>
              ))}
            </div>
          </div>
        </div>
      </div>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeEntry();
        }}
      >
        {shown === null ? null : (
          <EntryDetail
            key={shown.id}
            entry={shown}
            environmentId={environmentId}
            plugins={plugins}
            skillLabel={skillLabel}
            makes={shown.kind === "skill" ? makes(shown.name) : []}
            onOpenEntry={openEntry}
            exampleId={
              shown.exampleIn !== null && examples.some((example) => example.id === shown.exampleIn)
                ? shown.exampleIn
                : null
            }
            onMakeOne={search.from !== undefined || engineering ? makeOne : null}
            startEditing={shown.id === editingId}
            onOwnSkill={openOwnSkill}
            onRemoved={closeEntry}
          />
        )}
      </Dialog>
    </ChatPage>
  );
}

/**
 * See the example shows only where the server ships the example; Make one only where the entry
 * can be made and a New will take the ask. One that can't be made says which skill it needs.
 */
function EntryDetail(props: {
  readonly entry: LibraryEntry;
  readonly environmentId: EnvironmentId;
  /** The installed plugins; undefined until they are known. */
  readonly plugins: ReadonlyArray<InstalledPlugin> | undefined;
  readonly skillLabel: (name: string) => string;
  /** What a skill makes, each opening its own detail. */
  readonly makes: ReadonlyArray<LibraryDocument>;
  readonly onOpenEntry: (id: string) => void;
  /** The example its example is in (`exampleIn`); null where the server ships none. */
  readonly exampleId: string | null;
  /** Opens New on a template; null where no New would take it. */
  readonly onMakeOne: ((template: NewTemplate) => void) | null;
  /** A skill just added or copied: it opens on the editor. */
  readonly startEditing: boolean;
  readonly onOwnSkill: (skill: string) => void;
  readonly onRemoved: () => void;
}) {
  const { entry, plugins, skillLabel, exampleId, onMakeOne } = props;
  const state =
    entry.kind === "document" && plugins !== undefined ? availability(entry, plugins) : null;
  const template =
    entry.kind === "document" && state?.on === true && onMakeOne !== null
      ? makeOneTemplate(entry)
      : null;
  const example = exampleId === null ? null : entry.example;

  const rows: ReadonlyArray<readonly [string, ReactNode]> =
    entry.kind === "document"
      ? [
          ["You give", entry.give],
          ...(entry.asks === null ? [] : [["It asks you first", entry.asks] as const]),
          ["You get", entry.gets],
          ["Made by", madeBy(entry, skillLabel).join(", ")],
          ["Find it in", findItIn(entry).join(", ")],
        ]
      : [
          ...(entry.tryAsking === null ? [] : [["Try asking", `“${entry.tryAsking}”`] as const]),
          ...(props.makes.length === 0
            ? []
            : [
                [
                  "Makes",
                  props.makes.map((made) => (
                    <button
                      key={made.id}
                      type="button"
                      onClick={() => props.onOpenEntry(made.id)}
                      className="block text-start hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {made.name}
                    </button>
                  )),
                ] as const,
              ]),
        ];

  const facts =
    rows.length === 0 ? null : (
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-foreground">{value}</dd>
          </Fragment>
        ))}
      </dl>
    );

  if (entry.kind === "skill") {
    return (
      <SkillDetail
        entry={entry}
        environmentId={props.environmentId}
        name={entryName(entry, skillLabel)}
        startEditing={props.startEditing}
        facts={facts}
        onOwn={props.onOwnSkill}
        onRemoved={props.onRemoved}
      />
    );
  }

  return (
    <DialogPopup className="max-w-xl">
      <DialogHeader>
        <DialogTitle>{entryName(entry, skillLabel)}</DialogTitle>
      </DialogHeader>
      <DialogPanel>
        <LibraryPicture
          entry={entry}
          environmentId={props.environmentId}
          className="rounded-lg border border-border"
        />
        <DialogDescription>{entry.what}</DialogDescription>
        {facts}
        {state === null || state.on || plugins === undefined ? null : (
          <NeedsSkill needs={state} plugins={plugins} />
        )}
      </DialogPanel>
      {example === null && template === null ? null : (
        <DialogFooter>
          {example === null || exampleId === null ? null : (
            <SeeTheExample sampleId={exampleId} file={example} size="sm" className="sm:me-auto" />
          )}
          {template === null || onMakeOne === null ? null : (
            <Button size="sm" onClick={() => onMakeOne(template)}>
              Make one
            </Button>
          )}
        </DialogFooter>
      )}
    </DialogPopup>
  );
}
