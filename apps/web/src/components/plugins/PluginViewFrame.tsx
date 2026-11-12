import { cadToolsCause } from "../workbench/cadToolsCause";
import { partLabel } from "../workbench/partNames";
import { hasEngineeringSurfaces, isEngineeringInterface } from "../workbench/studioInterface";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  PluginOperationError,
  type EnvironmentId,
  type PluginViewDocument,
  type ThreadId,
} from "@t3tools/contracts";
import {
  makeMcpAppHost,
  McpAppHostRefusal,
  mcpAppStyleVariables,
  mcpResourceBytes,
  type McpAppCallToolResult,
  type McpAppHost,
  type McpAppHostContext,
} from "@t3tools/client-runtime/mcp-apps";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { readMcpAppCsp } from "@t3tools/shared/mcpApp";
import * as Schema from "effect/Schema";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { APP_BASE_NAME, APP_VERSION } from "~/branding";
import { requestConfirmDialog } from "~/confirmDialog";
import { isElectron } from "~/env";
import { useHtmlRenderTheme } from "~/hooks/useHtmlRenderTheme";
import { observeResize } from "~/lib/observeResize";
import { useEnvironment } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { reportPluginViewCall } from "./pluginViewCalls";
import {
  PLUGIN_VIEW_SRCDOC_SANDBOX,
  PLUGIN_VIEW_STAGED_SANDBOX,
  readPluginViewsBridge,
  srcdocPluginViewHtml,
  stagedPluginViewHtml,
  stagedPluginViewOrigin,
} from "./pluginViewHost";
import { setSimpleView, useSimpleView, viewerEditLayout } from "../workbench/simpleView";
import { sendsWithoutAsking } from "./sendWithoutAsking";
import {
  frontViewBusy,
  heardBuilds,
  useViewerEditState,
  type ViewerEditState,
} from "../workbench/viewerEditState";
import { modelsChanged } from "../workbench/useFolderModels";
import {
  takeViewerFocus,
  useViewerFocus,
  type ViewerFocusPlace,
} from "../workbench/references/viewerFocus";
import { useOpenChatFile } from "../workbench/useOpenInWorkbench";

/** What opens one plugin view: the tool whose result is the view, and where it runs. */

/**
 * Why a view could not open, in plain words: the server says it with paths and view names. The two
 * causes a person can act on when the CAD tools did not start are said (`cadToolsCause`).
 */
function plainViewError(message: string): string {
  if (/outside the thread's workspace/i.test(message)) {
    return "The viewer can only open files in this chat's folder.";
  }
  return cadToolsCause(message) ?? "The viewer couldn't open this.";
}

export interface PluginViewTarget {
  readonly environmentId: EnvironmentId;
  /** The thread whose server process the view talks to; null for an environment-wide view. */
  readonly threadId: ThreadId | null;
  readonly pluginId: string;
  readonly server: string;
  readonly tool: string;
  readonly title: string;
  readonly resourceUri: string;
  readonly arguments: Record<string, unknown>;
  /** Workspace-relative file the view opens. */
  readonly file?: string;
  /** A new thread's project folder, which the server cannot look up until the thread is sent. */
  readonly workspace?: string;
}

/** Largest file a view may hand the user through `ui/download-file`. */
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

const refusal = (result: {
  readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"];
}) => {
  const error = squashAtomCommandFailure(result);
  return new McpAppHostRefusal(
    error instanceof Error && error.message.trim() !== "" ? error.message : "Request failed.",
  );
};

/**
 * A tool call that ran out of time, answered as the plugin's own error rather than a refusal: the
 * host carries the view's calls, its server was only slow, so the view says that and keeps calling.
 */
const timedOut = (result: {
  readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"];
}): McpAppCallToolResult | null => {
  const error = squashAtomCommandFailure(result);
  return Schema.is(PluginOperationError)(error) && error.reason === "timed_out"
    ? { isError: true, content: [{ type: "text", text: error.message }] }
    : null;
};

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type Loaded =
  | { readonly _tag: "loading" }
  | { readonly _tag: "error"; readonly message: string }
  | { readonly _tag: "ready"; readonly document: PluginViewDocument };

/**
 * A plugin's MCP App view filling its container. The environment runs the
 * view's tool and returns its document; the frame then speaks the MCP Apps
 * bridge, its requests going to the plugin's own server. On desktop the
 * document gets its own `mcp-app://` origin so workers and storage work; in
 * a browser it runs in an opaque-origin `srcdoc` frame.
 */
export function PluginViewFrame(props: {
  readonly target: PluginViewTarget;
  /** Sends text to the thread as the user, after the user approves it. */
  readonly onSendMessage?: ((text: string) => Promise<void>) | undefined;
  /**
   * Takes what the view adds to the chat (`ui/update-model-context`, the CAD
   * viewer's "Add to chat") into the composer; without it the view is told no.
   */
  readonly onAddContext?: ((content: ReadonlyArray<unknown>) => void) | undefined;
  /** Opens a file beside the thread in a view of its own (a CAD view's Open Part); without it the view is told no. */
  readonly onOpenFile?: ((path: string) => void) | undefined;
  /**
   * Where Studio's bar finds what this CAD view says of its part, for Simple view
   * (`workbench/viewerEditState.ts`); without it the view is not asked.
   */
  readonly editStateKey?: string | undefined;
  /**
   * Where Studio's references ask this CAD view to show a part's feature (its chat and its tab's
   * file, `workbench/references/viewerFocus.ts`); without it the view is asked nothing.
   */
  readonly focusPlace?: ViewerFocusPlace | null | undefined;
}) {
  const { target } = props;
  const theme = useHtmlRenderTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState<Loaded>({ _tag: "loading" });
  const [generation, setGeneration] = useState(0);
  // Desktop: the staged URL; browser: the srcdoc. One of them, once ready.
  const [frame, setFrame] = useState<
    { readonly src: string; readonly origin: string } | { readonly srcdoc: string } | null
  >(null);
  const [closed, setClosed] = useState(false);

  const openView = useAtomCommand(pluginEnvironment.openView, { reportFailure: false });
  const request = useAtomCommand(pluginEnvironment.request, { reportFailure: false });
  // A view restored with its window asks once the app has reached its server, not before: asked
  // early, it would answer "not connected". Once open, a dropped connection leaves the view as it is.
  const phase = useEnvironment(target.environmentId)?.connection.phase;
  const [reached, setReached] = useState(false);
  if (!reached && (phase === undefined || phase === "connected")) setReached(true);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    setSize({ width: box.clientWidth, height: box.clientHeight });
    return observeResize(box, ([entry]) => {
      if (entry) {
        setSize({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      }
    });
  }, []);

  const argumentsKey = JSON.stringify(target.arguments);
  useEffect(() => {
    if (!reached) return;
    let cancelled = false;
    // oxlint-disable-next-line react/set-state-in-effect -- Each (re)open starts from a loading state.
    setLoaded({ _tag: "loading" });
    setFrame(null);
    void openView({
      environmentId: target.environmentId,
      input: {
        threadId: target.threadId,
        pluginId: target.pluginId,
        server: target.server,
        tool: target.tool,
        arguments: JSON.parse(argumentsKey) as Record<string, unknown>,
        ...(target.file === undefined ? {} : { file: target.file }),
        ...(target.workspace === undefined ? {} : { workspace: target.workspace }),
      },
    }).then((result) => {
      if (cancelled) return;
      if (result._tag === "Success") {
        setLoaded({ _tag: "ready", document: result.value });
      } else if (!isAtomCommandInterrupted(result)) {
        setLoaded({ _tag: "error", message: refusal(result).message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    openView,
    reached,
    target.environmentId,
    target.threadId,
    target.pluginId,
    target.server,
    target.tool,
    target.file,
    target.workspace,
    argumentsKey,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Bumped by "Try again" to reopen.
    generation,
  ]);

  // The document becomes a frame: staged on desktop, inline elsewhere.
  const document_ = loaded._tag === "ready" ? loaded.document : null;
  useEffect(() => {
    if (document_ === null) return;
    const bridge = readPluginViewsBridge();
    if (bridge === null) {
      // oxlint-disable-next-line react/set-state-in-effect -- The srcdoc is ready at once; staging is async.
      setFrame({ srcdoc: srcdocPluginViewHtml(document_) });
      return;
    }
    let cancelled = false;
    let staged: string | null = null;
    void bridge.stage(stagedPluginViewHtml(document_), document_.csp).then(
      (url) => {
        staged = url;
        if (cancelled) {
          void bridge.release(url);
          return;
        }
        setFrame({ src: url, origin: stagedPluginViewOrigin(url) });
      },
      () => {
        if (!cancelled) setLoaded({ _tag: "error", message: "The view could not be staged." });
      },
    );
    return () => {
      cancelled = true;
      if (staged !== null) void bridge.release(staged);
    };
  }, [document_]);

  // Studio: the CAD views take Simple view's layout, or the full workspace's (`workbench/simpleView.ts`).
  const editLayout = viewerEditLayout(useSimpleView());
  // Studio: where a reference opens this part's view (`workbench/references/viewerFocus.ts`), and
  // its script, where no feature of the part holds the cited line.
  const focus = useViewerFocus(props.focusPlace);
  const openChatFile = useOpenChatFile(
    props.focusPlace == null || target.threadId === null
      ? null
      : scopeThreadRef(target.environmentId, target.threadId),
  );
  const live = { theme, size, props, request, editLayout, focus, openChatFile };
  const latest = useRef(live);
  useEffect(() => {
    latest.current = live;
  });
  const hostRef = useRef<McpAppHost | null>(null);
  // `openai/modelContext` as the view last heard it. The view keeps what it added and
  // resends all of it until the host says the context is gone (null), as a sent message does.
  const modelContext = useRef<{ readonly taken: number } | null>(null);

  useEffect(() => {
    if (frame === null || document_ === null) return;
    const targetOrigin = "origin" in frame ? frame.origin : "*";
    const contentWindow = () => frameRef.current?.contentWindow ?? null;
    // What the view says of its part, kept while this host is up and forgotten once it is gone and
    // can hear no more: closed, reloaded or opened on another file, the view holds nothing.
    const editKey = props.editStateKey;
    const forgetEditState = () => {
      if (editKey !== undefined) useViewerEditState.getState().remove(editKey);
    };
    // What a reference asked it to show goes with it too, so a view opened later is not asked it.
    const forgetFocus = () => {
      const { focus: asked, props: current } = latest.current;
      if (asked !== null && current.focusPlace) takeViewerFocus(current.focusPlace, asked.nonce);
    };
    const hostContext = (): McpAppHostContext => {
      const current = latest.current;
      return {
        theme: current.theme.appearance,
        styles: { variables: mcpAppStyleVariables(current.theme.variables) },
        displayMode: "inline",
        availableDisplayModes: ["inline"],
        containerDimensions: { width: current.size.width, height: current.size.height },
        platform: isElectron ? "desktop" : "web",
        locale: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: `t3-code/${APP_VERSION}`,
        deviceCapabilities: {
          touch: window.matchMedia("(pointer: coarse)").matches,
          hover: window.matchMedia("(hover: hover)").matches,
        },
        safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        "openai/modelContext": modelContext.current,
        "studio/editLayout": current.editLayout,
        "studio/focus": current.focus,
      } as McpAppHostContext;
    };
    const call = async (
      method: "tools/call" | "resources/read",
      params: Record<string, unknown>,
    ): Promise<unknown> => {
      const { target: current } = latest.current.props;
      const result = await latest.current.request({
        environmentId: current.environmentId,
        input: {
          threadId: current.threadId,
          pluginId: current.pluginId,
          server: current.server,
          method,
          params,
        },
      });
      if (result._tag !== "Success") {
        const late = method === "tools/call" ? timedOut(result) : null;
        if (late !== null) return late;
        throw refusal(result);
      }
      return result.value.result;
    };
    const ask = async (message: string) => {
      const approved = await requestConfirmDialog(message);
      if (approved === undefined)
        throw new McpAppHostRefusal(`${APP_BASE_NAME} could not ask for approval here.`);
      if (approved !== true) throw new McpAppHostRefusal("Declined by the user.");
    };
    const csp = readMcpAppCsp(document_.csp);
    const host = makeMcpAppHost({
      app: {
        attachmentId: "",
        server: target.server,
        tool: target.tool,
        resourceUri: target.resourceUri,
        ...(csp === undefined ? {} : { csp }),
      },
      hostVersion: APP_VERSION,
      // A staged view has a real origin to address; a srcdoc view's is opaque,
      // where the window reference alone scopes delivery.
      post: (message) => contentWindow()?.postMessage(message, targetOrigin),
      hostContext,
      // The user opened this view of a plugin they installed, so its calls to
      // its own server run without a prompt each.
      callTool: async (input) => {
        const result = (await call("tools/call", {
          name: input.name,
          arguments: input.arguments,
        })) as McpAppCallToolResult;
        const { target: current } = latest.current.props;
        reportPluginViewCall({
          environmentId: current.environmentId,
          threadId: current.threadId,
          pluginId: current.pluginId,
          server: current.server,
          name: input.name,
          arguments: input.arguments,
          result,
        });
        return result;
      },
      readResource: ({ uri }) => call("resources/read", { uri }),
      openLink: async (url) => {
        if (document.activeElement !== frameRef.current || !navigator.userActivation?.isActive) {
          throw new McpAppHostRefusal("Links open only from a click in the view.");
        }
        window.open(url, "_blank", "noopener,noreferrer");
      },
      sendMessage: async (text) => {
        const send = latest.current.props.onSendMessage;
        if (send === undefined) throw new McpAppHostRefusal("Messages need a thread.");
        const { target: current } = latest.current.props;
        const atItsPress = sendsWithoutAsking({
          studio: hasEngineeringSurfaces(),
          pluginId: current.pluginId,
          focused: document.activeElement === frameRef.current,
          activated: navigator.userActivation?.isActive === true,
        });
        if (!atItsPress) await ask(`Send this message from ${current.title}?\n${text}`);
        await send(text);
      },
      updateModelContext: async (context) => {
        const add = latest.current.props.onAddContext;
        if (add === undefined) {
          throw new McpAppHostRefusal("Plugin views cannot add model context here.");
        }
        const content = context.content ?? [];
        if (content.length === 0) return;
        add(content);
        // Taken into the composer, so the context is spent: once this answer has gone, tell
        // the view (a change to null) so its next addition carries only what is new.
        const taken = (modelContext.current?.taken ?? 0) + 1;
        setTimeout(() => {
          modelContext.current = { taken };
          hostRef.current?.updateHostContext();
          modelContext.current = null;
          hostRef.current?.updateHostContext();
        }, 0);
      },
      requestDisplayMode: async () => "inline",
      ...(props.onOpenFile === undefined
        ? {}
        : {
            openFile: async (path: string) => {
              const open = latest.current.props.onOpenFile;
              if (open === undefined)
                throw new McpAppHostRefusal("Files open only beside a thread.");
              open(path);
            },
          }),
      ...(editKey === undefined
        ? {}
        : {
            onEditState: (state: ViewerEditState) => {
              useViewerEditState.getState().set(editKey, state);
              // CAD mode built a part: Home, the Overview and Cmd+K list it as it now is.
              if (heardBuilds(editKey, state.builds)) modelsChanged();
            },
            // A double-click on a face with the CAD tools hidden shows them, the feature that made
            // the face selected (`text-to-cad/.../edit/editLayout.js`). One on empty space, which
            // asks for the AI layout, hides nothing: only Hide CAD tools does.
            requestEditLayout: async (layout: "manual" | "ai") => {
              if (layout === "ai") return;
              if (frontViewBusy(useViewerEditState.getState().byView, editKey)) {
                throw new McpAppHostRefusal("Finish or cancel the command first");
              }
              setSimpleView(false);
            },
          }),
      ...(props.focusPlace == null
        ? {}
        : {
            onFocusTaken: ({ nonce, found }: { nonce: number; found: boolean }) => {
              const { focus: asked, props: current, openChatFile } = latest.current;
              if (!current.focusPlace) return;
              takeViewerFocus(current.focusPlace, nonce);
              // No feature holds the line (a constant, a helper's line, a build that failed): the
              // script opens there, as Simple view opens it, so the press is never lost.
              if (!found && asked?.nonce === nonce) openChatFile(asked.path, asked.line);
            },
          }),
      downloadFile: async (files) => {
        await ask(`Save ${files.map((file) => file.name).join(", ")} from ${target.title}?`);
        for (const file of files) {
          let bytes: Uint8Array | undefined;
          let mimeType = file.mimeType ?? "application/octet-stream";
          if (file._tag === "embedded") {
            bytes = file.bytes;
          } else {
            const read = (await call("resources/read", { uri: file.uri })) as {
              readonly contents?: ReadonlyArray<unknown>;
            };
            const content = read?.contents?.[0];
            bytes = mcpResourceBytes(content);
            const declared = (content as { readonly mimeType?: unknown } | undefined)?.mimeType;
            if (typeof declared === "string") mimeType = declared;
          }
          if (bytes === undefined) throw new McpAppHostRefusal(`${file.name} has no contents.`);
          if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
            throw new McpAppHostRefusal(`${file.name} is too large to save.`);
          }
          saveBlob(new Blob([bytes.slice()], { type: mimeType }), file.name);
        }
      },
      onRequestTeardown: () => {
        void host.teardown().then(() => {
          forgetEditState();
          forgetFocus();
          setClosed(true);
        });
      },
      onSizeChanged: () => {
        // The view fills a fixed box; its preferred height does not apply.
      },
    });
    hostRef.current = host;
    host.setToolCall({
      arguments: document_.toolInput,
      result: document_.toolResult as McpAppCallToolResult | undefined,
    });
    const receive = (event: MessageEvent) => {
      if (event.source === null || event.source !== contentWindow()) return;
      if (targetOrigin !== "*" && event.origin !== targetOrigin) return;
      host.receive(event.data);
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      void host.teardown();
      hostRef.current = null;
      forgetEditState();
      forgetFocus();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new document needs a new host; the rest is read through `latest`.
  }, [frame, document_]);

  useEffect(() => {
    hostRef.current?.updateHostContext();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Context changes trigger a resend.
  }, [theme, size, editLayout, focus]);

  const reload = () => {
    setClosed(false);
    setGeneration((value) => value + 1);
  };

  return (
    <div ref={boxRef} className="relative flex min-h-0 flex-1 flex-col">
      {closed ? (
        <Notice
          text={`${isEngineeringInterface() ? partLabel(target.title) : target.title} was closed`}
          action={reload}
          actionLabel="Reopen"
        />
      ) : loaded._tag === "error" ? (
        <Notice
          text={isEngineeringInterface() ? plainViewError(loaded.message) : loaded.message}
          action={reload}
          actionLabel="Try again"
        />
      ) : frame === null ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          {"srcdoc" in frame ? (
            // Outside the desktop app a view has no origin of its own, so views that start
            // workers from blob: URLs (the CAD viewer does) fail to load their content.
            <p className="text-muted-foreground border-b px-3 py-1.5 text-xs">
              If this view stays blank, open it in the {APP_BASE_NAME} desktop app.
            </p>
          ) : null}
          <iframe
            ref={frameRef}
            aria-label={target.title}
            className="block min-h-0 w-full flex-1 border-0"
            style={{ colorScheme: theme.appearance }}
            sandbox={"src" in frame ? PLUGIN_VIEW_STAGED_SANDBOX : PLUGIN_VIEW_SRCDOC_SANDBOX}
            {...("src" in frame ? { src: frame.src } : { srcDoc: frame.srcdoc })}
          />
        </>
      )}
    </div>
  );
}

function Notice(props: { text: string; actionLabel: string; action: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-muted-foreground text-xs">{props.text}</p>
      <Button size="xs" variant="outline" onClick={props.action}>
        {props.actionLabel}
      </Button>
    </div>
  );
}
