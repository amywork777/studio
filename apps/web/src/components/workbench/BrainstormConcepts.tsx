import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { CopyPlusIcon } from "lucide-react";

import { useAssetUrlState } from "~/assets/assetUrls";
import { useComposerHandleContext } from "~/composerHandleContext";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { workspaceAssetResource } from "../files/filePreviewMode";
import {
  type Concept,
  conceptSetFile,
  lightestConcept,
  massLabel,
  moreLikeThisPrompt,
  readConceptSet,
} from "./brainstorm";
import { OutOfDateIcon } from "./CheckBadge";
import { HARDWARE_ACTIONS } from "./hardwareActions";
import { handToChat } from "./handToChat";
import { withToolLine } from "./toolUsed";
import { useFolderModels } from "./useFolderModels";
import { useOpenInWorkbench } from "./useOpenInWorkbench";

const BRAINSTORM_LABEL = HARDWARE_ACTIONS.find((action) => action.id === "brainstorm")?.label ?? "";

/** A picture made before its script last changed by more than this is out of date (law 3). */
const STALE_AFTER_MS = 1_000;

/**
 * A set of concepts the turn made (`brainstorm/set-<n>/concepts.json`), as a grid of cards under
 * the reply: each its picture, name, material and mass. A card opens its part as CAD; "More like
 * this" asks the chat for four more grown from it.
 */
export function BrainstormConcepts(props: {
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly set: number;
}) {
  const { threadRef, root, set } = props;
  const environmentId = threadRef.environmentId;
  const file = useEnvironmentQuery(
    projectEnvironment.readFile({
      environmentId,
      input: { cwd: root, relativePath: conceptSetFile(set), allowMissing: true },
    }),
  ).data;
  if (file === undefined || file === null || file.exists === false) return null;
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
        {read.concepts.length} concepts · press one to open it
      </h3>
      <ul className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {read.concepts.map((concept) => (
          <ConceptCard
            key={concept.script}
            environmentId={environmentId}
            threadRef={threadRef}
            root={root}
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
  readonly lightest: boolean;
  /** When the set's file was last written, which is after each picture in it. */
  readonly writtenAt: string | null;
}) {
  const { environmentId, threadRef, root, concept } = props;
  const open = useOpenInWorkbench(threadRef);
  const composerRef = useComposerHandleContext();
  const models = useFolderModels(environmentId, root);
  const scriptAt = useEnvironmentQuery(
    projectEnvironment.readFile({
      environmentId,
      input: { cwd: root, relativePath: concept.script, allowMissing: true },
    }),
  ).data?.modifiedAt;
  // The code is the model (law 3): a script changed since its picture says so.
  const changed =
    scriptAt !== undefined &&
    props.writtenAt !== null &&
    Date.parse(scriptAt) > Date.parse(props.writtenAt) + STALE_AFTER_MS;
  const picture = useAssetUrlState(
    environmentId,
    concept.picture === null
      ? null
      : workspaceAssetResource({
          kind: "workspace-file",
          threadRef,
          draft: true,
          workspaceRoot: root,
          absolutePath: `${root.replace(/[\\/]+$/, "")}/${concept.picture}`,
        }),
    props.writtenAt,
  );
  const openConcept = () =>
    open(models.find((model) => model.script === concept.script)?.id ?? concept.script);
  const moreLikeThis = () => {
    if (composerRef === null) return;
    const link = serializeComposerFileLink(concept.script);
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
          ) : concept.picture === null ? (
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
              <span className="truncate">Part changed since this picture</span>
            </span>
          ) : null}
        </div>
      </button>
      <div className="px-1 pb-1">
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
