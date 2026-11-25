import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { studioConceptsFolder } from "@t3tools/shared/studioProjects";
import { CheckIcon, CopyPlusIcon, PackagePlusIcon } from "lucide-react";
import { useState } from "react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { useComposerHandleContext } from "~/composerHandleContext";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { workspaceAssetResource } from "../files/filePreviewMode";
import {
  asProjectPart,
  type Concept,
  conceptSetFolder,
  conceptSetsIn,
  conceptStem,
  inConceptSet,
  lightestConcept,
  massLabel,
  moreLikeThisPrompt,
  readConceptSet,
} from "./brainstorm";
import { OutOfDateIcon } from "./CheckBadge";
import { HARDWARE_ACTIONS } from "./hardwareActions";
import { handToChat } from "./handToChat";
import { PART_FOLDER, partStem } from "./newPart";
import { withToolLine } from "./toolUsed";
import { useFolderModels } from "./useFolderModels";
import { useAddPart } from "./useNewPart";
import { useOpenInWorkbench } from "./useOpenInWorkbench";
import { useStudioProjectAt, useStudioProjectsList } from "./useStudioProjects";

const BRAINSTORM_LABEL = HARDWARE_ACTIONS.find((action) => action.id === "brainstorm")?.label ?? "";

/** A read says `exists: false` only of a file that is not there; one that is has no `exists`. */
const isThere = <File extends { readonly exists?: boolean }>(
  file: File | null | undefined,
): file is File => file !== undefined && file !== null && file.exists !== false;

/** A picture made before its script last changed by more than this is out of date (law 3). */
const STALE_AFTER_MS = 1_000;

/**
 * The sets of concepts a reply links, each a grid of cards under it. They are read from the chat's
 * concepts folder (`studioConceptsFolder`), outside the project; nothing shows outside a project.
 */
export function ReplyConcepts(props: {
  readonly reply: string;
  readonly threadRef: ScopedThreadRef | null;
  readonly root: string | undefined;
}) {
  const environmentId = props.threadRef?.environmentId ?? null;
  const projectsFolder = useStudioProjectsList(environmentId).data?.folder ?? null;
  const project = useStudioProjectAt(environmentId, props.root ?? null);
  const { threadRef, root } = props;
  if (threadRef === null || root === undefined || projectsFolder === null || project === null) {
    return null;
  }
  const sets = conceptSetsIn(props.reply, threadRef.threadId);
  if (sets.length === 0) return null;
  const folder = studioConceptsFolder(projectsFolder, project.id, threadRef.threadId);
  return sets.map((set) => (
    <BrainstormConcepts key={set} threadRef={threadRef} root={root} folder={folder} set={set} />
  ));
}

/**
 * One set of concepts as a grid of cards: each its picture, name, mass and material. A card opens
 * its concept to look at; "Use this" makes it a part of the project; "More like this" asks the chat
 * for four more grown from it.
 */
function BrainstormConcepts(props: {
  readonly threadRef: ScopedThreadRef;
  /** The project's folder, where a used concept goes. */
  readonly root: string;
  /** The chat's concepts folder. */
  readonly folder: string;
  readonly set: number;
}) {
  const { threadRef, root, folder, set } = props;
  const environmentId = threadRef.environmentId;
  const file = useEnvironmentQuery(
    projectEnvironment.readFile({
      environmentId,
      input: {
        cwd: root,
        relativePath: inConceptSet(folder, set, "concepts.json"),
        allowMissing: true,
      },
    }),
  ).data;
  const models = useFolderModels(environmentId, conceptSetFolder(folder, set));
  if (!isThere(file)) return null;
  const read = readConceptSet(set, file.contents);
  if (read === null || read.concepts.length === 0) return null;
  const lightest = lightestConcept(read.concepts);
  return (
    <section
      aria-label={`Concepts, set ${set}`}
      className="@container mt-3 flex min-w-0 flex-col gap-2"
      data-brainstorm-set={set}
    >
      <h3 className="text-xs text-muted-foreground">
        {read.concepts.length} concepts · not in the project until you use one
      </h3>
      <ul className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {read.concepts.map((concept) => (
          <ConceptCard
            key={concept.script}
            environmentId={environmentId}
            threadRef={threadRef}
            root={root}
            script={inConceptSet(folder, set, concept.script)}
            picture={concept.picture === null ? null : inConceptSet(folder, set, concept.picture)}
            model={models.find((model) => model.script === concept.script)?.id ?? null}
            concept={concept}
            lightest={concept.script === lightest}
            writtenAt={file.modifiedAt ?? null}
          />
        ))}
      </ul>
    </section>
  );
}

function ConceptCard(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly concept: Concept;
  /** Its script and picture, in full. */
  readonly script: string;
  readonly picture: string | null;
  /** Its model's document id, once the CAD service lists it. */
  readonly model: string | null;
  readonly lightest: boolean;
  /** When the set's file was last written, which is after each picture in it. */
  readonly writtenAt: string | null;
}) {
  const { environmentId, threadRef, root, concept } = props;
  const open = useOpenInWorkbench(threadRef);
  const composerRef = useComposerHandleContext();
  const addPart = useAddPart(threadRef, root);
  const [adding, setAdding] = useState(false);
  const read = (cwd: string, relativePath: string) =>
    projectEnvironment.readFile({
      environmentId,
      input: { cwd, relativePath, allowMissing: true },
    });
  const script = useEnvironmentQuery(read(root, props.script)).data;
  // Where using it puts it, and whether that part is this concept: then it is in the project.
  const stem = partStem(concept.name);
  const partPath = `${PART_FOLDER}/${stem}.py`;
  const partRead = useEnvironmentQuery(read(root, partPath));
  const part = partRead.data;
  const projectModels = useFolderModels(environmentId, root);
  const asPart = isThere(script)
    ? asProjectPart(script.contents, conceptStem(concept), stem)
    : null;
  const used = asPart !== null && isThere(part) && part.contents === asPart;
  // The code is the model (law 3): a script changed since its picture says so.
  const changed =
    script?.modifiedAt !== undefined &&
    props.writtenAt !== null &&
    Date.parse(script.modifiedAt) > Date.parse(props.writtenAt) + STALE_AFTER_MS;
  const picture = useAssetUrlState(
    environmentId,
    props.picture === null
      ? null
      : workspaceAssetResource({
          kind: "workspace-file",
          threadRef,
          draft: true,
          workspaceRoot: root,
          absolutePath: props.picture,
        }),
    props.writtenAt,
  );
  const openConcept = () => open(props.model ?? props.script);
  const takeIntoProject = () => {
    if (used) {
      open(projectModels.find((model) => model.script === partPath)?.id ?? partPath);
      return;
    }
    if (addPart === null || !isThere(script)) return;
    const contents = script.contents;
    setAdding(true);
    void addPart({
      name: concept.name,
      script: (free) => asProjectPart(contents, conceptStem(concept), free),
    }).finally(() => {
      setAdding(false);
      partRead.refresh();
    });
  };
  const moreLikeThis = () => {
    if (composerRef === null) return;
    const link = serializeComposerFileLink(props.script);
    handToChat(composerRef, withToolLine(BRAINSTORM_LABEL, moreLikeThisPrompt(concept, link)));
  };
  const facts = [massLabel(concept.massGrams), concept.material].filter(
    (fact): fact is string => fact !== null,
  );
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={openConcept}
        aria-label={`Open ${concept.name}`}
        className="flex min-w-0 cursor-pointer flex-col text-left outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="relative aspect-square w-full bg-muted">
          {picture._tag === "Success" ? (
            <img
              src={picture.url}
              alt=""
              draggable={false}
              className="absolute inset-0 size-full object-contain select-none"
            />
          ) : props.picture === null ? (
            <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
              No picture
            </span>
          ) : null}
          {props.lightest ? (
            <Badge variant="secondary" className="absolute top-1.5 left-1.5">
              Lightest
            </Badge>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5 px-2 pt-1.5 pb-1">
          <span className="truncate text-sm font-medium text-foreground">{concept.name}</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {facts.join(" · ")}
          </span>
          {concept.idea === "" ? null : (
            <span className="line-clamp-2 text-xs text-muted-foreground">{concept.idea}</span>
          )}
          {changed ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <OutOfDateIcon className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">Changed since this picture</span>
            </span>
          ) : null}
        </div>
      </button>
      <div className="flex min-w-0 flex-wrap items-center gap-1 px-1 pb-1">
        <Button
          size="xs"
          variant={used ? "ghost-muted" : "outline"}
          disabled={adding || (!used && (addPart === null || asPart === null))}
          onClick={takeIntoProject}
          aria-label={used ? `Open ${partPath}` : `Use ${concept.name} in the project`}
        >
          {used ? <CheckIcon aria-hidden="true" /> : <PackagePlusIcon aria-hidden="true" />}
          {used ? "In the project" : adding ? "Adding…" : "Use this"}
        </Button>
        <Button
          size="xs"
          variant="ghost-muted"
          disabled={composerRef === null}
          onClick={moreLikeThis}
        >
          <CopyPlusIcon aria-hidden="true" />
          More like this
        </Button>
      </div>
    </li>
  );
}
