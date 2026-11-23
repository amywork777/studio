import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { ToolCaseIcon } from "lucide-react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useFilesystemReadAccess } from "~/state/filesystem";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { NO_AGENT } from "./agentWords";
import { fileTint, KIND_ICONS } from "./kinds";
import { useStudioProjectAt } from "./useStudioProjects";
import { folderFiles } from "./projectModels";
import { projectStarters } from "./starterJobs";
import { useFolderModels } from "./useFolderModels";
import { openToolbox } from "./toolboxOpen";
import { useLeadPart } from "./useLeadPart";
import { missingAgent } from "./startAgent";

/**
 * A new thread's starters, made from the project (`starterJobs.ts`): the lead part, recent files
 * and the brief, in two even columns so none outranks the others. Nothing without a project. A pick
 * goes into the composer to edit before sending.
 */
export function ProjectStarters(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly composerRef: ComposerHandleRef;
}) {
  const { environmentId, cwd } = props;
  const { canReadFiles } = useFilesystemReadAccess(environmentId);
  const recent = useEnvironmentQuery(
    canReadFiles
      ? projectEnvironment.searchEntries({
          environmentId,
          input: { cwd, query: "", limit: 200, kind: "file" },
        })
      : null,
  ).data?.entries;
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const brief = useStudioProjectAt(environmentId, cwd)?.project.brief ?? null;
  // Its cadgen 0.8 models stand where their scripts are among its recent files.
  const models = useFolderModels(environmentId, cwd);
  const lead = useLeadPart(environmentId, cwd)?.file ?? null;
  const paths = (recent ?? []).map((entry) => entry.path);
  const skills = new Set(
    (plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
  );
  const starters = projectStarters(folderFiles(paths, models), skills, brief, new Set(paths), lead);
  // With no agent to send to, a job would sit in a box that cannot send: the chips say why instead.
  const noAgent =
    missingAgent(useAtomValue(serverEnvironment.configValueAtom(environmentId)), null) !== null;
  if (starters.length === 0) return null;

  return (
    <div className="pointer-events-auto mt-4 grid grid-cols-2 gap-1">
      {noAgent ? (
        <p className="col-span-2 pb-1 text-xs text-muted-foreground">
          {NO_AGENT}. Connect one in Settings to start a job.
        </p>
      ) : null}
      {starters.map((starter) => {
        const Icon = KIND_ICONS[starter.kind];
        return (
          <button
            key={starter.label}
            type="button"
            disabled={noAgent}
            className="flex min-h-6 min-w-0 items-start gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-start text-xs leading-4.5 text-foreground outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-64 disabled:hover:bg-background"
            onClick={() => {
              const composer = props.composerRef.current;
              if (!composer) return;
              composer.insertTextAtEnd(starter.prompt, { ensureLeadingBoundary: true });
              composer.focusAtEnd();
            }}
          >
            <Icon
              className={`mt-0.5 size-3.5 shrink-0 ${fileTint(starter.kind)}`}
              aria-hidden="true"
            />
            <span className="min-w-0">{starter.label}</span>
          </button>
        );
      })}
      {/* The way on to every other job: the Toolbox's popup, as its title-bar button opens it. */}
      <button
        type="button"
        className="flex min-h-6 min-w-0 items-start gap-1.5 rounded-md border border-dashed border-border px-2 py-0.5 text-start text-xs leading-4.5 text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        onClick={() => void openToolbox()}
      >
        <ToolCaseIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">More tools…</span>
      </button>
    </div>
  );
}
