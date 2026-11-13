import type { EnvironmentId } from "@t3tools/contracts";

import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";
import type { NewTemplate } from "./newTemplates";
import { humanName } from "./partNames";
import { readStudioImport } from "./studioImportBridge";
import { useStudioProjectsList } from "./useStudioProjects";

/**
 * Document templates of the person's own (a client's PRD format, a company's design review), kept
 * as files in a Templates folder beside Studio's projects, `<projects folder>/Templates`, so every
 * project can use them. Each is offered in the New dialog's Documents beside the built-in ones
 * (`DOCUMENT_TEMPLATES`), and the agent writes the document following the file.
 */

export const TEMPLATES_FOLDER = "Templates";

/** A template file as the New dialog offers it: named after the file. */
export function fileTemplate(path: string): NewTemplate {
  const name = path.split(/[\\/]/).pop() ?? path;
  const stem = name.replace(/\.[^.]+$/, "");
  const label = humanName(stem);
  return {
    id: `file:${path}`,
    discipline: "Documents",
    label,
    description: `Your template, ${name}`,
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: label,
    file: path,
  };
}

/** The files of the Templates folder's listing that are templates: not hidden, not nested. */
export function templateFiles(paths: ReadonlyArray<string>): string[] {
  return paths
    .filter((path) => !/[\\/]/.test(path) && !path.startsWith("."))
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * The person's document templates (`TEMPLATES_FOLDER`), with Add (pick files, copied in by the
 * desktop app) and Show (the folder in Finder, made if missing), each null where it cannot be done.
 */
export function useDocumentTemplates(environmentId: EnvironmentId): {
  readonly folder: string | null;
  readonly templates: ReadonlyArray<NewTemplate>;
  readonly add: (() => Promise<void>) | null;
  readonly show: (() => Promise<void>) | null;
} {
  const projects = useStudioProjectsList(environmentId).data;
  const folder =
    projects === undefined || projects === null
      ? null
      : `${projects.folder.replace(/[\\/]+$/, "")}/${TEMPLATES_FOLDER}`;
  const listing = useEnvironmentQuery(
    folder === null
      ? null
      : projectEnvironment.listEntries({ environmentId, input: { cwd: folder } }),
  );
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: true });
  const bridge = readStudioImport();
  const files = templateFiles(
    (listing.data?.entries ?? [])
      .filter((entry) => entry.kind === "file")
      .map((entry) => entry.path),
  );
  const add = async () => {
    if (bridge === null || folder === null) return;
    const picked = await bridge.pick();
    if (picked.length === 0) return;
    await bridge.copy(picked, folder);
    listing.refresh();
  };
  const show = async () => {
    if (folder === null) return;
    // Made first, empty, so there is a folder to open and drop templates into.
    if (bridge !== null) await bridge.copy([], folder);
    await openInEditor({ environmentId, input: { cwd: folder, editor: "file-manager" } });
  };
  return {
    folder,
    templates: folder === null ? [] : files.map((file) => fileTemplate(`${folder}/${file}`)),
    add: bridge === null || folder === null ? null : add,
    show: folder === null ? null : show,
  };
}
