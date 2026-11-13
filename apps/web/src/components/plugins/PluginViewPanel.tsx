import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useState } from "react";

import type { PluginAppSurface } from "~/rightPanelStore";
import { TitleBlock } from "../workbench/TitleBlock";
import { useOpenInWorkbench } from "../workbench/useOpenInWorkbench";
import { pluginViewKey } from "../workbench/viewerEditState";
import { viewerFocusPlace } from "../workbench/references/viewerFocus";
import { PluginViewFrame } from "./PluginViewFrame";

const isAbsolute = (path: string) => path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);

/**
 * A plugin view as a right-panel tab, running against the thread's plugin servers. In a new
 * thread, which the server has no record of until its first message, a file is named by its
 * absolute path in the project (`draftWorkspaceRoot`), or by that project's folder when it opens
 * no file, and the view keeps what it opened with once the thread is sent, so it is not opened again.
 */
export default function PluginViewPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly surface: PluginAppSurface;
  readonly draftWorkspaceRoot?: string | undefined;
  readonly onSendMessage?: ((text: string) => Promise<void>) | undefined;
  readonly onAddContext?: ((content: ReadonlyArray<unknown>) => void) | undefined;
  /** The thread's folder and its latest file changes, for the title block's checks. */
  readonly workspaceRoot?: string | undefined;
  readonly workspaceMutationId?: string | null | undefined;
}) {
  const { surface, draftWorkspaceRoot } = props;
  const named =
    surface.file === undefined || draftWorkspaceRoot === undefined || isAbsolute(surface.file)
      ? surface.file
      : `${draftWorkspaceRoot.replace(/[\\/]+$/, "")}/${surface.file}`;
  const [opened, setOpened] = useState<{
    readonly id: string;
    readonly file: string | undefined;
    readonly workspace: string | undefined;
  } | null>(null);
  if (opened?.id !== surface.id) {
    setOpened({ id: surface.id, file: named, workspace: draftWorkspaceRoot });
  }
  const file = opened?.id === surface.id ? opened.file : named;
  // A view that opens no file (a model by its document id) names a new thread's project instead.
  const workspace = opened?.id === surface.id ? opened.workspace : draftWorkspaceRoot;
  // A file the view asks for (a CAD view's Open Part) opens beside the thread in a tab of its own,
  // and what the view says of its part is kept by this tab, for Studio's bar (`StudioPanelBar`).
  const threadRef = scopeThreadRef(props.environmentId, props.threadId);
  const openInWorkbench = useOpenInWorkbench(threadRef);
  return (
    <>
      <TitleBlock
        environmentId={props.environmentId}
        threadId={props.threadId}
        pluginId={surface.pluginId}
        cwd={props.workspaceRoot}
        mutationId={props.workspaceMutationId}
      />
      <PluginViewFrame
        key={surface.id}
        target={{
          environmentId: props.environmentId,
          threadId: props.threadId,
          pluginId: surface.pluginId,
          server: surface.server,
          tool: surface.tool,
          title: surface.title,
          resourceUri: surface.resourceUri,
          arguments: surface.arguments,
          ...(file === undefined ? {} : { file }),
          ...(workspace === undefined ? {} : { workspace }),
        }}
        onSendMessage={props.onSendMessage}
        onAddContext={props.onAddContext}
        onOpenFile={openInWorkbench}
        editStateKey={pluginViewKey(threadRef, surface.id)}
        focusPlace={viewerFocusPlace(threadRef, surface)}
      />
    </>
  );
}
