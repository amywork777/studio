import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  ChevronLeftIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  InfoIcon,
  ScrollTextIcon,
} from "lucide-react";
import { useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { shellEnvironment } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";
import ReadOnlySourcePreview from "../files/ReadOnlySourcePreview";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { toastManager } from "../ui/toast";
import { aboutFile, isPlainText, openLabel } from "./aboutFile";
import { CHECK_STATUS } from "./CheckBadge";
import { type CheckResult, parseCheckResult } from "./checkResults";
import { FileKindIcon } from "./FileKindIcon";
import { folderLabel } from "./folderLabel";
import { partLabel } from "./partNames";
import { readStudioImport } from "./studioImportBridge";
import { openInPanel } from "./useOpenInWorkbench";

/** A check's result as a report: how it went, in a line, then what to fix and what to look at. */
function CheckReport(props: { readonly result: CheckResult; readonly onOpenModel: () => void }) {
  const { result } = props;
  const { variant, word, Icon } = CHECK_STATUS[result.status];
  return (
    <section
      aria-label="Result"
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={variant}>
          <Icon aria-hidden="true" />
          {result.check} {word}
        </Badge>
        <span className="text-sm text-muted-foreground">{partLabel(result.part)}</span>
      </div>
      <p className="text-sm text-foreground">{result.headline}</p>
      {result.issues.length === 0 ? null : (
        <ul className="flex flex-col gap-2 border-t border-border pt-3">
          {result.issues.map((issue) => {
            // A note about the run is no warning: no amber, which means one (law 7).
            const Mark =
              issue.note === true
                ? InfoIcon
                : CHECK_STATUS[issue.severity === "error" ? "fix" : "warnings"].Icon;
            return (
              <li
                key={`${issue.severity}:${issue.summary}:${issue.fix ?? ""}`}
                className="flex gap-2 text-sm"
              >
                <Mark
                  aria-hidden="true"
                  className={
                    issue.severity === "error"
                      ? "mt-0.5 size-4 shrink-0 text-destructive"
                      : issue.note === true
                        ? "mt-0.5 size-4 shrink-0 text-muted-foreground"
                        : "mt-0.5 size-4 shrink-0 text-warning-foreground"
                  }
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-foreground">{issue.summary}</span>
                  {issue.fix === null ? null : (
                    <span className="text-muted-foreground">Fix: {issue.fix}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <Button size="sm" variant="outline" onClick={props.onOpenModel}>
          Show the result
        </Button>
      </div>
    </section>
  );
}

/**
 * A file with no viewer of its own, in place of a code editor or a "binary file" error: what it is
 * (`aboutFile`), Open in its own app and Show in Finder, and its text read only, so a machine file
 * is never edited by accident. A check's result reads as a report, plain text as a document.
 */
export function StudioFilePage(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly relativePath: string;
  /** The file on the server's disk, for Show in Finder; null when it has none. */
  readonly absolutePath: string | null;
  /** Its text; null for a file with none to show (a spreadsheet, a zip). */
  readonly text: string | null;
  /** Why it could not be read, when that is not just that it has no text. */
  readonly problem: string | null;
}) {
  const { environmentId, relativePath, text } = props;
  const [showText, setShowText] = useState(false);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: true });
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const result = text === null ? null : parseCheckResult(relativePath, text);
  const name = relativePath.replaceAll("\\", "/").split("/").at(-1) ?? relativePath;
  const folder = relativePath.replaceAll("\\", "/").split("/").slice(0, -1).join("/");
  const canReveal =
    props.absolutePath !== null && serverConfig?.availableEditors.includes("file-manager") === true;
  const showInFolder = folderLabel(serverConfig?.environment.platform.os);
  // Opening in its own app happens on this Mac, so only for files on this Mac's own server.
  const bridge = readStudioImport();
  const local = usePrimaryEnvironmentId() === environmentId;
  const label = openLabel(relativePath);
  const openFile = bridge?.openFile;
  const open =
    local && label !== null && props.absolutePath !== null && openFile !== undefined
      ? { label, run: () => openFile(props.absolutePath ?? "") }
      : null;

  if (showText && text !== null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
          <Button variant="ghost" size="sm" onClick={() => setShowText(false)}>
            <ChevronLeftIcon />
            {partLabel(name)}
          </Button>
          <span className="truncate text-xs text-muted-foreground">
            Read only. Ask in the chat to change it.
          </span>
        </div>
        <ReadOnlySourcePreview name={relativePath} text={text} />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-gutter-both">
      <WorkspacePageContainer className="max-w-3xl">
        <header className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileKindIcon path={relativePath} className="size-6" />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold text-balance text-foreground">
              {result === null ? partLabel(name) : `${result.check} of ${partLabel(result.part)}`}
            </h1>
            <span className="text-sm text-muted-foreground">
              {result === null ? aboutFile(relativePath) : "A check's result."}
            </span>
            <span className="text-xs text-muted-foreground">
              {name}
              {folder === "" ? "" : `, in ${folder}`}
            </span>
          </span>
        </header>
        {props.problem === null ? null : (
          <p className="text-sm text-muted-foreground">{props.problem}</p>
        )}
        {result === null ? null : (
          <CheckReport
            result={result}
            onOpenModel={() => openInPanel(plugins, props.threadRef, result.model)}
          />
        )}
        {text !== null && result === null && isPlainText(relativePath) ? (
          <article className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {text}
          </article>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {open === null ? null : (
            <Button
              size="sm"
              onClick={() =>
                void open.run().catch((error: unknown) =>
                  toastManager.add({
                    type: "error",
                    title: "Couldn't open it",
                    description: error instanceof Error ? error.message : `Try ${showInFolder}.`,
                  }),
                )
              }
            >
              <ExternalLinkIcon />
              {open.label}
            </Button>
          )}
          {canReveal ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void openInEditor({
                  environmentId,
                  input: { cwd: props.absolutePath ?? "", editor: "file-manager" },
                })
              }
            >
              <FolderOpenIcon />
              {showInFolder}
            </Button>
          ) : null}
          {text !== null && !isPlainText(relativePath) ? (
            <Button variant="ghost" size="sm" onClick={() => setShowText(true)}>
              <ScrollTextIcon />
              Show the text
            </Button>
          ) : null}
        </div>
      </WorkspacePageContainer>
    </div>
  );
}
