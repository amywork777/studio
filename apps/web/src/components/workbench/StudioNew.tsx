import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { useDocumentTemplates } from "./documentTemplates";
import { NewDialog, type NewJob, type NewPart } from "./NewDialog";
import { type NewRequest, useNewDialogStore } from "./newDialogStore";
import { templateOffers } from "./newTemplates";

/**
 * New, the same button and dialog everywhere: in a project's toolbar Create hands the job to the
 * open chat; on Home and Projects it starts a new project. It also opens on request from elsewhere
 * (`useNewDialogStore`) and takes the request, so one ask opens this New once and no other.
 */
export function StudioNew(props: {
  readonly environmentId: EnvironmentId;
  /** The open project's folder; empty on Home. */
  readonly cwd: string;
  /** On Home and the Projects page: Create makes a new project. */
  readonly newProject?: boolean;
  /** No New button: it opens only when asked (`useNewDialogStore`). */
  readonly hideButton?: boolean;
  /** Inside a project New is a file action, as quiet as Import beside it: `outline`. Else filled. */
  readonly buttonVariant?: "default" | "outline";
  readonly onCreate: (job: NewJob) => void;
  /** New's Part: the part made, with no agent turn. */
  readonly onNewPart: (part: NewPart) => Promise<unknown>;
}) {
  const { environmentId } = props;
  const newProject = props.newProject ?? false;
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const offers = (() => {
    const known = plugins ?? [];
    const skills = new Set(known.flatMap((plugin) => (plugin.enabled ? plugin.skills : [])));
    // Until the plugins are known, only what needs no skill, so nothing reads as not installed.
    return templateOffers(skills, known).filter(
      (offer) =>
        offer.template.source === "new" && (plugins !== undefined || offer.availability.on),
    );
  })();
  const documents = useDocumentTemplates(environmentId);
  // Each open is a fresh dialog (`count`), on what was asked for, if anything.
  const [opened, setOpened] = useState<{
    readonly open: boolean;
    readonly count: number;
    readonly asked: NewRequest | null;
  }>({ open: false, count: 0, asked: null });
  const pending = useNewDialogStore((store) => store.request);
  const take = useNewDialogStore((store) => store.take);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- takes a New request posted to the shared store from elsewhere, so one ask opens one New
  useEffect(() => {
    if (pending === null) return;
    const asked = take(newProject);
    if (asked === null) return;
    // oxlint-disable-next-line react/set-state-in-effect -- Takes the ask out of the store, so this New alone opens on it.
    setOpened((current) => ({ open: true, count: current.count + 1, asked }));
  }, [newProject, pending, take]);
  const discipline = opened.asked?.discipline ?? null;

  return (
    <>
      {props.hideButton ? null : (
        <Button
          variant={props.buttonVariant ?? "default"}
          size="sm"
          onClick={() =>
            setOpened((current) => ({ open: true, count: current.count + 1, asked: null }))
          }
        >
          <PlusIcon aria-hidden="true" />
          New
        </Button>
      )}
      {opened.open ? (
        <NewDialog
          key={opened.count}
          open
          onOpenChange={(open) => {
            if (!open) setOpened((current) => ({ ...current, open: false }));
          }}
          environmentId={environmentId}
          cwd={props.cwd}
          offers={offers}
          fileTemplates={documents.templates}
          onAddTemplate={documents.add}
          onShowTemplates={documents.show}
          {...(discipline === null ? {} : { initialDiscipline: discipline })}
          initialTemplateId={opened.asked?.templateId ?? null}
          parts={[]}
          {...(newProject ? { newProject: true } : {})}
          onCreate={props.onCreate}
          onNewPart={props.onNewPart}
        />
      ) : null}
    </>
  );
}

/**
 * New project, from wherever it is offered outside Home (⌘K, the project switcher): New, on Home,
 * for a new project, or on the Projects page when that is open (`askNewProject`).
 */
export function useAskNewProject(): () => void {
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });
  return () => {
    useNewDialogStore.getState().askNewProject();
    if (pathname !== "/" && pathname !== "/projects") void navigate({ to: "/" });
  };
}
