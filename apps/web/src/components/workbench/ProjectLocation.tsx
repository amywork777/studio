import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { resolvePastedPath } from "@t3tools/shared/path";
import { newProjectsFolderOf } from "@t3tools/shared/projectSettings";
import { FolderOpenIcon } from "lucide-react";

import { useUpdateEnvironmentSettings } from "~/hooks/useSettings";
import { serverEnvironment } from "~/state/server";
import { Button } from "../ui/button";
import { DraftInput } from "../ui/draft-input";
import { readStudioImport } from "./studioImportBridge";

/**
 * Where new projects are made on an environment, and a way to change it. One setting
 * (`newProjectsFolder`) for New's Location and Settings alike, so the folder last chosen is where
 * the next project goes. Choosing the server's own folder again clears the setting.
 */
export function useNewProjectsFolder(environmentId: EnvironmentId) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const builtIn = config?.newProjectsRoot ?? null;
  return {
    /** Null until the server says, or on a server that makes no projects. */
    folder: newProjectsFolderOf(config) ?? null,
    builtIn,
    choose: (folder: string) => {
      const next = folder.trim();
      updateSettings({ newProjectsFolder: next === builtIn ? "" : next });
    },
  };
}

/** A folder for new projects: typed, or in the desktop app chosen with the system's folder picker. */
export function ProjectLocationInput(props: {
  readonly id?: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly onChange: (folder: string) => void;
}) {
  const pickFolder = readStudioImport()?.pickFolder;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <DraftInput
        {...(props.id === undefined ? {} : { id: props.id })}
        size="sm"
        className="min-w-0 flex-1"
        value={props.value}
        onCommit={(next) => {
          if (next.trim() !== "") props.onChange(next);
        }}
        normalizeDraft={resolvePastedPath}
        {...(props.placeholder === undefined ? {} : { placeholder: props.placeholder })}
        spellCheck={false}
        aria-label="Location"
      />
      {pickFolder === undefined ? null : (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Choose a folder"
          title="Choose a folder"
          onClick={() =>
            void pickFolder("Save new projects in", "Choose").then((picked) => {
              if (picked !== null) props.onChange(picked);
            })
          }
        >
          <FolderOpenIcon aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
