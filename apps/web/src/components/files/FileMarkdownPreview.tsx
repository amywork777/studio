import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatMarkdown from "~/components/ChatMarkdown";
import { DocumentHeader } from "~/components/workbench/DocumentHeader";
import { SOURCE_REMARK_PLUGINS } from "~/components/workbench/documentSource";
import { DOCUMENT_REMARK_PLUGINS } from "~/components/workbench/remarkNoIndentedCode";
import { useEngineeringInterface } from "~/components/workbench/studioInterface";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";
import { maskMarkdownFrontmatter } from "@t3tools/shared/markdownFrontmatter";

// Indented lines read as text, and each piece carries its place in the file for editing in place.
const STUDIO_DOCUMENT_PLUGINS = [...DOCUMENT_REMARK_PLUGINS, ...SOURCE_REMARK_PLUGINS];

export function FileMarkdownPreview(props: {
  readonly cwd: string;
  readonly relativePath: string;
  readonly text: string;
  readonly threadRef: ScopedThreadRef;
  readonly workspaceMutationId: string | null;
  readonly onTaskListChange?:
    | ((input: { readonly markerOffset: number; readonly checked: boolean }) => void)
    | undefined;
}) {
  // Studio's documents read as documents: a line indented four spaces is a step, not code.
  const documents = useEngineeringInterface();
  const lastSeparator = Math.max(
    props.relativePath.lastIndexOf("/"),
    props.relativePath.lastIndexOf("\\"),
  );
  const imageBaseDir =
    lastSeparator >= 0
      ? resolvePathLinkTarget(props.relativePath.slice(0, lastSeparator), props.cwd)
      : props.cwd;

  return (
    <>
      <DocumentHeader text={props.text} relativePath={props.relativePath} />
      <div data-document="">
        <ChatMarkdown
          text={maskMarkdownFrontmatter(props.text)}
          cwd={props.cwd}
          imageBaseDir={imageBaseDir}
          threadRef={props.threadRef}
          workspaceMutationId={props.workspaceMutationId}
          className="mx-auto max-w-4xl px-6 py-5"
          onTaskListChange={props.onTaskListChange}
          {...(documents ? { extraRemarkPlugins: STUDIO_DOCUMENT_PLUGINS } : {})}
        />
      </div>
    </>
  );
}
