import type { EnvironmentId } from "@t3tools/contracts";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useEffect, useState } from "react";

import { useStableCallback } from "~/hooks/useStableCallback";

import { Button } from "../ui/button";
import { useImportDialogStore } from "./importDialogStore";
import { freshFiles, type ImportFile, whereFilesAre } from "./importPlan";
import { readRememberedScan, readStudioImport, rememberScan } from "./studioImportBridge";
import { useEnvironmentFolders } from "./useProjectFolders";
import { useStudioProjects } from "./useStudioProjects";

/** Once per session: the folders are read again a few seconds after Studio opens. */
let lookedThisSession = false;
const LOOK_AFTER_MS = 3000;

const baseName = (path: string) => path.split(/[\\/]+/).findLast((part) => part !== "") ?? path;

/**
 * New CAD files in the folders the last scan read, since it read them, outside Studio's projects:
 * "3 new CAD files in Downloads since Oct 19", with Import them and Not now. Not now waits for
 * files newer than now.
 */
export function NewFilesNotice(props: { readonly environmentId: EnvironmentId }) {
  const knownFolders = useEnvironmentFolders(props.environmentId);
  const studioProjects = useStudioProjects(props.environmentId);
  const knownKeys = [
    ...knownFolders.map((folder) => studioFolderKey(folder.workspaceRoot)),
    ...Object.values(studioProjects).flatMap((project) => project.folders.map(studioFolderKey)),
  ];
  const knownNow = useStableCallback(() => knownKeys);
  const show = useImportDialogStore((store) => store.show);
  const [found, setFound] = useState<{
    readonly files: ReadonlyArray<ImportFile>;
    readonly where: string;
    readonly since: number;
    readonly roots: ReadonlyArray<string>;
  } | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- waits, then scans the remembered folders through the desktop bridge (IPC) once a session, cancelled on unmount
  useEffect(() => {
    const bridge = readStudioImport();
    const remembered = readRememberedScan();
    if (lookedThisSession || bridge === null || remembered === null) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      lookedThisSession = true;
      void (async () => {
        const fresh: ImportFile[] = [];
        for (const root of remembered.roots) {
          const scan = await bridge.scan(root).catch(() => null);
          if (cancelled) return;
          if (scan !== null) fresh.push(...freshFiles(scan.files, remembered.at, knownNow()));
        }
        if (cancelled || fresh.length === 0) return;
        setFound({
          files: fresh,
          where: whereFilesAre(remembered.roots, fresh),
          since: remembered.at,
          roots: remembered.roots,
        });
      })();
    }, LOOK_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [knownNow]);

  if (found === null) return null;
  const dismiss = () => {
    rememberScan({ roots: found.roots, at: Date.now() });
    setFound(null);
  };
  const count = found.files.length;
  const names = found.files.slice(0, 3).map((file) => baseName(file.path));
  const since = new Date(found.since).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">
          {count === 1 ? "1 new CAD file" : `${count} new CAD files`} in {found.where} since {since}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {names.join(", ")}
          {count > names.length ? ` and ${count - names.length} more` : ""}
        </span>
      </span>
      <Button
        size="sm"
        onClick={() => {
          show({ kind: "files", files: found.files });
          dismiss();
        }}
      >
        Import them
      </Button>
      <Button variant="ghost" size="sm" onClick={dismiss}>
        Not now
      </Button>
    </div>
  );
}
