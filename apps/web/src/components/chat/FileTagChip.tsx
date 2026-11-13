import type { ReactNode } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { ContextChipLabel } from "../ContextChip";
import { WorkspaceEntryIcon } from "./WorkspaceEntryIcon";
import { FileKindIcon } from "../workbench/FileKindIcon";
import { useEngineeringInterface, useFileChipLabel } from "../workbench/studioInterface";

export function FileTagChipContent(props: {
  icon?: ReactNode;
  path: string;
  label: string;
  theme: "light" | "dark";
  environmentId?: EnvironmentId | null | undefined;
  cwd?: string | undefined;
}) {
  const label = useFileChipLabel(props.path, props.label);
  // Studio marks a file by its kind, in its kind's color, as everywhere else (`kinds.ts`), not
  // with a code editor's language icons.
  const studio = useEngineeringInterface();
  return (
    <>
      {props.icon ??
        (studio ? (
          <FileKindIcon path={props.path} className="size-3.5" />
        ) : (
          <WorkspaceEntryIcon
            path={props.path}
            environmentId={props.environmentId}
            cwd={props.cwd}
            theme={props.theme}
          />
        ))}
      <ContextChipLabel>{label}</ContextChipLabel>
    </>
  );
}
