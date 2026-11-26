import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { CloudUploadIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { BackupDialog } from "./BackupDialog";
import { useLastBackup } from "./useBackup";

/**
 * Back up, among the Overview's project actions: the one way a project goes to the person's own
 * account (law 9), the same dialog a project tile's menu opens (`ProjectMenu`).
 */
export function ProjectBackupButton(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly project: StudioProject;
}) {
  const [open, setOpen] = useState(false);
  const backup = useLastBackup(props.projectId);
  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        <CloudUploadIcon />
        Back up…
      </Button>
      {open ? (
        <BackupDialog
          open
          onOpenChange={setOpen}
          environmentId={props.environmentId}
          project={{
            name: props.project.name,
            folders: props.project.folders,
            brief: props.project.brief,
          }}
          last={backup.last}
          onBackedUp={backup.remember}
        />
      ) : null}
    </>
  );
}
