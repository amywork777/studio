import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { ArrowUpIcon, MaximizeIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { toastManager } from "../../ui/toast";
import { overviewParts } from "../checkResults";
import { handToChat } from "../handToChat";
import { partLink } from "../partLink";
import { humanName } from "../partNames";
import { useChangeSize } from "../ProjectSizes";
import { folderFiles } from "../projectModels";
import { type NamedSize, type SizeGroup, SIZE_NUMBER } from "../sizes";
import { useFolderModels } from "../useFolderModels";
import { useFolderPaths } from "../useFolderPaths";
import { usePictures } from "../usePictures";
import { useProjectSizes } from "../useSizes";
import { useCadService } from "../useVersions";
import {
  buildNodeGraph,
  downstream,
  graphParts,
  nodePrompt,
  nodeSockets,
  SHAPE,
  socketReach,
  upstream,
  wirePrompt,
  type GraphNode,
  type InputSocket,
  type OutputSocket,
  type SocketType,
} from "./nodeGraph";
import { PreviewPicture } from "./PreviewPicture";
import { useSizePreview, type PartPreview } from "./useSizePreview";
import { CONTEXT_FILE, readPartContext, writePartContext, type PartContext } from "./partContext";

const NODE_W = 248;
const COL_GAP = 112;
const ROW_GAP = 40;
const PAD = 48;
/** The title bar's height, and each socket row's: the sockets sit at fixed heights for the wires. */
const HEADER_H = 32;
const SOCKET_ROW = 22;
const SOCKETS_TOP = 6;
/** A node's height before it is measured. */
const GUESS_H = 280;
/** At most this many scripts are read for their imports. */
const MOST_SCRIPTS = 120;
/** A node shows this many of its sizes until it is opened out. */
const SIZES_SHOWN = 5;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;

/** A point on the canvas, before the view's pan and zoom. */
type Spot = { readonly x: number; readonly y: number };
/** One output being followed (`to`: along its one wire into that node), while it is pointed at or changed. */
type Trace = { readonly from: string; readonly socket: string; readonly to?: string };
/** How a card stands to the output being followed. */
type TraceRole = "source" | "user" | "rebuilds" | "apart";
/** Where a card's dots sit below its top, by `out:<socket>` and `in:<input>`. */
type Dots = Readonly<Record<string, number>>;
/** The view: the canvas is shifted by (x, y) and scaled by k. */
type View = { readonly x: number; readonly y: number; readonly k: number };

/** A socket's colour by what flows through it: a part's shape is CAD's hue, a size a quiet grey. */
const WIRE: Record<SocketType, string> = {
  Part: "var(--kind-cad)",
  Size: "var(--muted-foreground)",
};

/** The height of a socket row's middle below the node's top. */
const socketY = (index: number) => HEADER_H + SOCKETS_TOP + index * SOCKET_ROW + SOCKET_ROW / 2;

/**
 * The Nodes prototype: the project's parts as cards wired by what their scripts import, after
 * ComfyUI. Each card holds what its part must meet and changes that part alone: its message names
 * the one script to edit, and the parts wired after it rebuild. A prototype on its own branch.
 */
export function ProjectNodes(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly root: string;
  readonly mutationId: string | null;
  readonly composerRef: ComposerHandleRef | null;
  readonly onOpen: (root: string, path: string) => void;
}) {
  const { environmentId, root } = props;
  const models = useFolderModels(environmentId, root, props.mutationId);
  const [listing] = useFolderPaths(environmentId, [root]);
  const paths = listing?.paths ?? null;
  const read = useAtomQueryRunner(projectEnvironment.readFile, { reportFailure: false });
  const write = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });

  // Every script's text, for its imports; read again after the agent changes files.
  const [sources, setSources] = useState<ReadonlyMap<string, string>>(new Map());
  const [context, setContext] = useState<PartContext>({});
  const scripts = useMemo(
    () => (paths ?? []).filter((path) => path.toLowerCase().endsWith(".py")).slice(0, MOST_SCRIPTS),
    [paths],
  );
  useEffect(() => {
    let live = true;
    const text = async (relativePath: string) => {
      const result = await read({ environmentId, input: { cwd: root, relativePath } });
      return result._tag === "Success" ? result.value.contents : null;
    };
    void Promise.all(scripts.map(async (script) => [script, await text(script)] as const)).then(
      (pairs) => {
        if (!live) return;
        setSources(new Map(pairs.filter((pair): pair is [string, string] => pair[1] !== null)));
      },
    );
    if ((paths ?? []).includes(CONTEXT_FILE)) {
      void text(CONTEXT_FILE).then((contents) => {
        if (live && contents !== null) setContext(readPartContext(contents));
      });
    }
    return () => {
      live = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- An agent's change (`mutationId`) reads the scripts again.
  }, [environmentId, read, root, scripts, paths, props.mutationId]);

  // The parts the Overview lists, so a project of STEPs made by scripts shows as well as one of
  // cadgen models.
  const parts = useMemo(
    () => graphParts(overviewParts(folderFiles(paths ?? [], models)), paths ?? []),
    [paths, models],
  );
  const graph = useMemo(() => buildNodeGraph(parts, sources), [parts, sources]);
  const pictures = usePictures({
    environmentId,
    cwd: root,
    paths: parts.map((part) => part.id),
    versions: Object.fromEntries(
      parts.flatMap((part) => (part.updated === null ? [] : [[part.id, part.updated]])),
    ),
  });

  const post = useCadService(props.threadRef);
  const [reads, setReads] = useState(0);
  const folders = useMemo(() => [root], [root]);
  const sizes = useProjectSizes({ post, folders, mutationId: props.mutationId, reads });
  const sizeGroups = useMemo(
    () =>
      new Map(
        (sizes?.[0]?.sizes?.groups ?? []).map((group): [string, SizeGroup] => [group.file, group]),
      ),
    [sizes],
  );
  const changeSize = useChangeSize(post, props.composerRef, () => setReads((value) => value + 1));

  const sockets = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, nodeSockets(graph, node.id)])),
    [graph],
  );
  // Each node's measured height, so a column's nodes stack without overlapping.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [dots, setDots] = useState<Record<string, Dots>>({});
  const [moved, setMoved] = useState<Record<string, Spot>>({});
  const laidOut = useMemo(() => {
    const spots = new Map<string, Spot>();
    const tops = new Map<number, number>();
    for (const node of graph.nodes) {
      const top = tops.get(node.column) ?? PAD;
      spots.set(node.id, { x: PAD + node.column * (NODE_W + COL_GAP), y: top });
      tops.set(node.column, top + (heights[node.id] ?? GUESS_H) + ROW_GAP);
    }
    return spots;
  }, [graph, heights]);
  const spotOf = (id: string): Spot => moved[id] ?? laidOut.get(id) ?? { x: PAD, y: PAD };

  const [selected, setSelected] = useState<string | null>(null);
  // When each node was asked to change (seconds), and which change each following node waits on.
  const [asked, setAsked] = useState<Record<string, { at: number; by: string }>>({});

  const following = useMemo(
    () => new Set(selected === null ? [] : downstream(graph, selected)),
    [graph, selected],
  );
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);
  const names = (ids: ReadonlyArray<string>) =>
    ids.flatMap((id) => (byId.has(id) ? [byId.get(id)?.name ?? id] : []));

  // The output being followed: the one being changed, else the one pointed at.
  const [hovered, setHovered] = useState<Trace | null>(null);
  const [pinned, setPinned] = useState<Trace | null>(null);
  const trace = pinned ?? hovered;
  const reach = useMemo(
    () => (trace === null ? null : socketReach(graph, trace.from, trace.socket, trace.to)),
    [graph, trace],
  );
  const roleOf = (id: string): TraceRole | null => {
    if (trace === null || reach === null) return null;
    if (id === trace.from) return "source";
    if (reach.users.includes(id)) return "user";
    return reach.rebuilds.includes(id) ? "rebuilds" : "apart";
  };
  const traceLine = (() => {
    if (trace === null || reach === null) return null;
    const node = byId.get(trace.from);
    if (node === undefined) return null;
    const name = trace.socket === SHAPE ? node.name : humanName(trace.socket);
    const users = listOf(names(reach.users));
    const rebuilds = listOf(names(reach.rebuilds));
    if (users === "") {
      return node.kind === "Shared"
        ? `No part uses ${name} yet.`
        : `Changing ${name} rebuilds ${rebuilds}.`;
    }
    return `${name} goes into ${users}. Changing it rebuilds ${rebuilds}.`;
  })();
  // What the size followed does to each part it rebuilds, from edit mode's own preview: a number
  // typed over it, or else a little more, which lights the faces it shapes.
  const [typed, setTyped] = useState<number | null>(null);
  const previewed = (() => {
    if (trace === null || trace.socket === SHAPE) return null;
    const node = byId.get(trace.from);
    const group = node === undefined ? undefined : sizeGroups.get(node.script);
    const size = group?.sizes.find((held) => held.name === trace.socket);
    if (group === undefined || size === undefined || size.value === null) return null;
    return { file: group.file, line: size.line, name: size.name, now: size.value };
  })();
  const previewParts = (previewed === null || reach === null ? [] : reach.rebuilds).flatMap(
    (id) => {
      const node = byId.get(id);
      return node !== undefined && node.script.toLowerCase().endsWith(".py")
        ? [{ id, script: node.script }]
        : [];
    },
  );
  const previews = useSizePreview({
    post,
    root,
    mutationId: props.mutationId,
    parts: previewParts,
    size: previewed,
    typed: pinned === null ? null : typed,
  });

  const linkOf = (node: GraphNode) =>
    node.kind === "Shared"
      ? `[${node.name}](${node.script})`
      : partLink({ path: node.id, name: node.name });

  const saveContext = async (next: PartContext) => {
    setContext(next);
    const written = await write({
      environmentId,
      input: { cwd: root, relativePath: CONTEXT_FILE, contents: writePartContext(next) },
    });
    if (written._tag !== "Success") {
      toastManager.add({ type: "error", title: `${CONTEXT_FILE} could not be saved` });
    }
  };

  const change = (node: GraphNode, ask: string) => {
    const composerRef = props.composerRef;
    if (composerRef === null || ask.trim() === "") return;
    const link = linkOf(node);
    handToChat(
      composerRef,
      nodePrompt({
        link,
        kind: node.kind,
        ask,
        context: context[node.script] ?? [],
        uses: names(upstream(graph, node.id)),
        usedBy: names(downstream(graph, node.id)),
      }),
    );
    const at = Date.now() / 1000;
    setAsked((before) => ({
      ...before,
      [node.id]: { at, by: node.id },
      ...Object.fromEntries(downstream(graph, node.id).map((id) => [id, { at, by: node.id }])),
    }));
  };

  // The canvas: pan by dragging the background or scrolling, zoom by pinching or Ctrl and scroll.
  const viewport = useRef<HTMLDivElement>(null);
  // Whether the canvas was moved or zoomed by hand, after which it no longer fits itself.
  const touched = useRef(false);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const toCanvas = (clientX: number, clientY: number): Spot => {
    const box = viewport.current?.getBoundingClientRect();
    return {
      x: (clientX - (box?.left ?? 0) - view.x) / view.k,
      y: (clientY - (box?.top ?? 0) - view.y) / view.k,
    };
  };
  const zoomAt = (factor: number, px: number, py: number) =>
    setView((before) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, before.k * factor));
      return {
        k,
        x: px - ((px - before.x) * k) / before.k,
        y: py - ((py - before.y) * k) / before.k,
      };
    });
  useEffect(() => {
    const element = viewport.current;
    if (element === null) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      touched.current = true;
      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect();
        zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX - box.left, event.clientY - box.top);
      } else {
        setView((before) => ({
          ...before,
          x: before.x - event.deltaX,
          y: before.y - event.deltaY,
        }));
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });
  const fit = () => {
    const element = viewport.current;
    if (element === null || graph.nodes.length === 0) return;
    const spots = graph.nodes.map((node) => ({
      spot: spotOf(node.id),
      h: heights[node.id] ?? GUESS_H,
    }));
    const left = Math.min(...spots.map(({ spot }) => spot.x));
    const top = Math.min(...spots.map(({ spot }) => spot.y));
    const right = Math.max(...spots.map(({ spot }) => spot.x + NODE_W));
    const bottom = Math.max(...spots.map(({ spot, h }) => spot.y + h));
    const box = element.getBoundingClientRect();
    const k = Math.min(
      1,
      Math.max(
        MIN_ZOOM,
        Math.min((box.width - 48) / (right - left), (box.height - 112) / (bottom - top)),
      ),
    );
    setView({
      k,
      x: (box.width - (right - left) * k) / 2 - left * k,
      y: Math.max(24, (box.height - (bottom - top) * k) / 2) - top * k,
    });
  };
  // Fit the graph whenever its layout changes (the scripts' imports arrive after the parts), until
  // the canvas is moved or zoomed by hand.
  const measured =
    graph.nodes.length > 0 && graph.nodes.every((node) => heights[node.id] !== undefined);
  const layoutKey = measured
    ? graph.nodes
        .map((node) => `${node.id}@${node.column}:${Math.round((heights[node.id] ?? 0) / 40)}`)
        .join("|") + `#${graph.edges.length}`
    : null;
  useLayoutEffect(() => {
    if (layoutKey === null || touched.current) return;
    fit();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Fits again only when the layout changes.
  }, [layoutKey]);

  // What a press on the canvas is doing: panning it, dragging a node, or drawing a wire.
  const press = useRef<
    | { kind: "pan"; x: number; y: number; from: View }
    | { kind: "node"; id: string; dx: number; dy: number; moved: boolean }
    | { kind: "wire"; from: string; socket: OutputSocket }
    | null
  >(null);
  const [drawing, setDrawing] = useState<{ from: string; socket: OutputSocket; to: Spot } | null>(
    null,
  );
  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    touched.current = true;
    press.current = { kind: "pan", x: event.clientX, y: event.clientY, from: view };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const startNode = (id: string, event: PointerEvent<HTMLElement>) => {
    const at = toCanvas(event.clientX, event.clientY);
    const spot = spotOf(id);
    press.current = { kind: "node", id, dx: at.x - spot.x, dy: at.y - spot.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const startWire = (from: string, socket: OutputSocket, event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    press.current = { kind: "wire", from, socket };
    setDrawing({ from, socket, to: toCanvas(event.clientX, event.clientY) });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const held = press.current;
    if (held === null) return;
    if (held.kind === "pan") {
      setView({
        ...held.from,
        x: held.from.x + event.clientX - held.x,
        y: held.from.y + event.clientY - held.y,
      });
    } else if (held.kind === "node") {
      held.moved = true;
      const at = toCanvas(event.clientX, event.clientY);
      setMoved((before) => ({ ...before, [held.id]: { x: at.x - held.dx, y: at.y - held.dy } }));
    } else {
      setDrawing({
        from: held.from,
        socket: held.socket,
        to: toCanvas(event.clientX, event.clientY),
      });
    }
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const held = press.current;
    press.current = null;
    if (held?.kind === "pan" && held.x === event.clientX && held.y === event.clientY) {
      setSelected(null);
    }
    if (held?.kind === "node" && !held.moved) {
      setSelected((before) => (before === held.id ? null : held.id));
    }
    if (held?.kind === "wire") {
      setDrawing(null);
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const from = byId.get(held.from);
      const to = target === undefined ? undefined : byId.get(target);
      if (from === undefined || to === undefined || to.id === from.id) return;
      if (props.composerRef === null) return;
      handToChat(
        props.composerRef,
        wirePrompt({
          fromLink: linkOf(from),
          name: held.socket.name,
          type: held.socket.type,
          toLink: linkOf(to),
        }),
      );
    }
  };

  if (paths === null) {
    return <p className="px-6 py-8 text-sm text-muted-foreground">Reading the project…</p>;
  }
  if (graph.nodes.length === 0) {
    return (
      <p className="px-6 py-8 text-sm text-muted-foreground">
        No parts yet. Once the agent builds one, it shows here as a node.
      </p>
    );
  }

  // Each dot where its card measured it, else where the socket rows would put it.
  const outputSpot = (id: string, socket: string): Spot | null => {
    const index = sockets.get(id)?.outputs.findIndex((held) => held.id === socket) ?? -1;
    if (index < 0) return null;
    const spot = spotOf(id);
    return { x: spot.x + NODE_W, y: spot.y + (dots[id]?.[`out:${socket}`] ?? socketY(index)) };
  };
  const wires = graph.nodes.flatMap((node) =>
    (sockets.get(node.id)?.inputs ?? []).flatMap((input, index) => {
      const start = outputSpot(input.from, input.fromSocket);
      if (start === null) return [];
      const spot = spotOf(node.id);
      const y = dots[node.id]?.[`in:${input.id}`] ?? socketY(index);
      return [{ input, to: node.id, start, end: { x: spot.x, y: spot.y + y } }];
    }),
  );
  const tracing = (input: InputSocket, to: string) =>
    trace !== null &&
    input.from === trace.from &&
    input.fromSocket === trace.socket &&
    (trace.to === undefined || trace.to === to);
  const pending =
    drawing === null
      ? null
      : { start: outputSpot(drawing.from, drawing.socket.id), end: drawing.to };

  return (
    <div
      ref={viewport}
      role="application"
      aria-label="Nodes"
      className="relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
      style={{
        backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
        backgroundSize: `${20 * view.k}px ${20 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={startPan}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="pointer-events-none absolute top-0 left-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
      >
        <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden>
          {wires.map(({ input, to, start, end: finish }) => {
            const traced = tracing(input, to);
            const lit =
              trace === null
                ? selected !== null &&
                  (input.from === selected || following.has(input.from)) &&
                  following.has(to)
                : traced;
            const quiet = trace === null ? selected !== null && !lit : !traced;
            return (
              <path
                key={`${input.id}>${to}`}
                d={curve(start, finish)}
                fill="none"
                stroke={traced ? "var(--primary)" : WIRE[input.type]}
                strokeOpacity={quiet ? 0.18 : 0.9}
                strokeWidth={traced ? 3.5 : lit ? 3 : 2}
              />
            );
          })}
          {pending?.start ? (
            <path
              d={curve(pending.start, pending.end)}
              fill="none"
              stroke={WIRE[drawing?.socket.type ?? "Part"]}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          ) : null}
        </svg>
        {graph.nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            spot={spotOf(node.id)}
            inputs={sockets.get(node.id)?.inputs ?? []}
            outputs={sockets.get(node.id)?.outputs ?? []}
            sizes={sizeGroups.get(node.script) ?? null}
            picture={pictures.get(node.id)}
            context={context[node.script] ?? []}
            selected={selected === node.id}
            follows={following.has(node.id)}
            role={roleOf(node.id)}
            litOut={trace?.from === node.id ? trace.socket : null}
            litIn={(sockets.get(node.id)?.inputs ?? []).flatMap((input) =>
              tracing(input, node.id) ? [input.id] : [],
            )}
            preview={previews.get(node.id)}
            typed={pinned !== null && typed !== null}
            onTrace={(next, pin) => {
              const trail =
                next === null
                  ? null
                  : next.to === undefined
                    ? { from: next.from ?? node.id, socket: next.socket }
                    : { from: next.from ?? node.id, socket: next.socket, to: next.to };
              if (pin) setPinned(trail);
              else setHovered(trail);
            }}
            onTyped={(text) => setTyped(text === null ? null : Number(text))}
            onDots={(found) =>
              setDots((before) =>
                sameDots(before[node.id], found) ? before : { ...before, [node.id]: found },
              )
            }
            dropTarget={drawing !== null && drawing.from !== node.id}
            asked={asked[node.id]}
            askedBy={byId.get(asked[node.id]?.by ?? "")?.name}
            canChange={props.composerRef !== null}
            onHeight={(height) =>
              setHeights((before) =>
                Math.abs((before[node.id] ?? 0) - height) < 1
                  ? before
                  : { ...before, [node.id]: height },
              )
            }
            onOpen={() => props.onOpen(root, node.kind === "Shared" ? node.script : node.id)}
            onContext={(lines) => void saveContext({ ...context, [node.script]: lines })}
            onChange={(ask) => change(node, ask)}
            onChangeSize={(group, size, text) => changeSize(root, group.file, size, text)}
            onNodePress={(event) => startNode(node.id, event)}
            onWirePress={(socket, event) => startWire(node.id, socket, event)}
          />
        ))}
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-xs">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom out"
          onClick={() =>
            zoomAt(
              1 / 1.2,
              (viewport.current?.clientWidth ?? 0) / 2,
              (viewport.current?.clientHeight ?? 0) / 2,
            )
          }
        >
          <MinusIcon />
        </Button>
        <span className="w-10 text-center text-xs text-muted-foreground tabular-nums">
          {Math.round(view.k * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom in"
          onClick={() =>
            zoomAt(
              1.2,
              (viewport.current?.clientWidth ?? 0) / 2,
              (viewport.current?.clientHeight ?? 0) / 2,
            )
          }
        >
          <PlusIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Fit to view" onClick={fit}>
          <MaximizeIcon />
        </Button>
      </div>
      {traceLine === null ? (
        <p className="pointer-events-none absolute right-3 bottom-3 text-xs text-muted-foreground">
          Point at a size to see where it goes. Drag a dot onto another node to use it there.
        </p>
      ) : (
        <p
          aria-live="polite"
          className="pointer-events-none absolute right-3 bottom-3 max-w-md rounded-lg border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-xs"
        >
          {traceLine}
        </p>
      )}
    </div>
  );
}

/** Names in a sentence: "A", "A and B", "A, B and C". */
function listOf(items: ReadonlyArray<string>): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function sameDots(before: Dots | undefined, after: Dots): boolean {
  if (before === undefined) return false;
  const keys = Object.keys(after);
  return (
    keys.length === Object.keys(before).length &&
    keys.every((key) => Math.abs((before[key] ?? -1) - (after[key] ?? 0)) < 0.5)
  );
}

/** A wire from an output to an input, bending out of the one and into the other as ComfyUI's do. */
function curve(start: Spot, end: Spot): string {
  const bend = Math.max(48, Math.abs(end.x - start.x) / 2);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

function SocketDot(props: {
  readonly type: SocketType;
  readonly side: "in" | "out";
  /** Its key among its card's dots (`out:<socket>`, `in:<input>`), where its wire meets it. */
  readonly dot: string;
  readonly lit?: boolean;
}) {
  return (
    <span
      aria-hidden
      data-socket={props.dot}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full border-2 border-card",
        props.lit ? "size-3" : "size-2.5",
        props.side === "in" ? "-left-[5px]" : "-right-[5px]",
      )}
      style={{ backgroundColor: props.lit ? "var(--primary)" : WIRE[props.type] }}
    />
  );
}

/** What a card says a size pointed at does: the follow being made a trace by its parent. */
type Pointed = { readonly socket: string; readonly from?: string; readonly to?: string };

function NodeCard(props: {
  readonly node: GraphNode;
  readonly spot: Spot;
  readonly inputs: ReadonlyArray<InputSocket>;
  readonly outputs: ReadonlyArray<OutputSocket>;
  readonly sizes: SizeGroup | null;
  readonly picture: string | undefined;
  readonly context: ReadonlyArray<string>;
  readonly selected: boolean;
  readonly follows: boolean;
  readonly dropTarget: boolean;
  readonly role: TraceRole | null;
  /** The output of this card being followed, and the inputs its wire comes in by. */
  readonly litOut: string | null;
  readonly litIn: ReadonlyArray<string>;
  /** What the size followed does to this part, from edit mode's preview; `typed` for a number typed. */
  readonly preview: PartPreview | undefined;
  readonly typed: boolean;
  readonly asked: { at: number; by: string } | undefined;
  readonly askedBy: string | undefined;
  readonly canChange: boolean;
  readonly onHeight: (height: number) => void;
  readonly onDots: (dots: Dots) => void;
  readonly onTrace: (pointed: Pointed | null, pin: boolean) => void;
  readonly onTyped: (text: string | null) => void;
  readonly onOpen: () => void;
  readonly onContext: (lines: ReadonlyArray<string>) => void;
  readonly onChange: (ask: string) => void;
  readonly onChangeSize: (group: SizeGroup, size: NamedSize, text: string) => Promise<boolean>;
  readonly onNodePress: (event: PointerEvent<HTMLElement>) => void;
  readonly onWirePress: (socket: OutputSocket, event: PointerEvent<HTMLElement>) => void;
}) {
  const { node, onTrace } = props;
  const [line, setLine] = useState("");
  const [addingLine, setAddingLine] = useState(false);
  const [ask, setAsk] = useState("");
  const [allSizes, setAllSizes] = useState(false);
  const card = useRef<HTMLElement>(null);
  const onHeight = props.onHeight;
  useLayoutEffect(() => {
    const element = card.current;
    if (element === null) return;
    return observeResize(element, () => onHeight(element.offsetHeight));
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Observed once; the callback reads the latest node.
  }, []);
  // Where each dot sits, read after every layout: the size rows move as sizes load and open out.
  // The card is drawn scaled, so the offsets are divided by the scale it shows at.
  useLayoutEffect(() => {
    const element = card.current;
    if (element === null) return;
    const box = element.getBoundingClientRect();
    const scale = element.offsetHeight > 0 ? box.height / element.offsetHeight : 1;
    const found: Record<string, number> = {};
    for (const dot of element.querySelectorAll<HTMLElement>("[data-socket]")) {
      const at = dot.getBoundingClientRect();
      found[dot.dataset.socket ?? ""] = (at.top + at.height / 2 - box.top) / scale;
    }
    props.onDots(found);
  });

  const built = node.updated === null ? null : Number(node.updated);
  const state =
    props.asked === undefined
      ? null
      : built !== null && built >= props.asked.at
        ? "Rebuilt"
        : props.asked.by === node.id
          ? "Changing"
          : `Rebuilds after ${props.askedBy ?? "a change"}`;
  const addLine = () => {
    const text = line.trim();
    if (text === "") return;
    if (!props.context.includes(text)) props.onContext([...props.context, text]);
    setLine("");
    setAddingLine(false);
  };
  // A size other parts take carries its dot on its own row, first and always shown; the socket
  // rows keep the part's shape and any size with no row of its own.
  const sizeList = props.sizes?.sizes ?? [];
  const sizeNames = new Set(sizeList.map((size) => size.name));
  const sized = new Map(
    props.outputs.flatMap((socket) =>
      socket.type === "Size" && sizeNames.has(socket.id) ? [[socket.id, socket] as const] : [],
    ),
  );
  const rowOutputs = props.outputs.filter((socket) => !sized.has(socket.id));
  const ordered = [
    ...sizeList.filter((size) => sized.has(size.name)),
    ...sizeList.filter((size) => !sized.has(size.name)),
  ];
  const shownSizes = allSizes ? ordered : ordered.slice(0, Math.max(SIZES_SHOWN, sized.size));
  const rows = Math.max(props.inputs.length, rowOutputs.length);
  const preview = props.preview;
  const drawn = preview !== undefined && (preview.body !== null || preview.change !== null);

  return (
    <section
      ref={card}
      data-node={node.id}
      aria-label={node.name}
      className={cn(
        "pointer-events-auto absolute flex cursor-default flex-col rounded-lg border bg-card shadow-md",
        props.role === "source"
          ? "border-primary ring-2 ring-primary/40"
          : props.role === "user"
            ? "border-primary ring-1 ring-primary/30"
            : props.role === "rebuilds"
              ? "border-primary/60"
              : props.role === "apart"
                ? "border-border opacity-50"
                : props.selected
                  ? "border-primary ring-2 ring-primary/40"
                  : props.follows
                    ? "border-primary/60"
                    : props.dropTarget
                      ? "border-dashed border-primary/60"
                      : "border-border",
      )}
      style={{ left: props.spot.x, top: props.spot.y, width: NODE_W }}
    >
      <header
        className="flex cursor-grab items-center gap-2 rounded-t-lg border-b border-border bg-muted/60 px-3 active:cursor-grabbing"
        style={{ height: HEADER_H }}
        onPointerDown={props.onNodePress}
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-xs"
          style={{ backgroundColor: node.kind === "Shared" ? WIRE.Size : WIRE.Part }}
        />
        <span className="truncate text-xs font-medium text-foreground">{node.name}</span>
        <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
          {node.kind === "Shared" ? "Sizes" : node.kind}
        </span>
      </header>
      {rows === 0 ? null : (
        <div
          className="relative grid grid-cols-2 gap-x-2"
          style={{ paddingTop: SOCKETS_TOP, paddingBottom: SOCKETS_TOP }}
        >
          <div className="flex min-w-0 flex-col">
            {props.inputs.map((socket) => {
              const lit = props.litIn.includes(socket.id);
              return (
                <div
                  key={socket.id}
                  className={cn(
                    "relative flex items-center rounded-r-md pl-3",
                    lit ? "bg-primary/10" : null,
                  )}
                  style={{ height: SOCKET_ROW }}
                  onPointerEnter={() =>
                    onTrace({ from: socket.from, socket: socket.fromSocket, to: node.id }, false)
                  }
                  onPointerLeave={() => onTrace(null, false)}
                >
                  <SocketDot type={socket.type} side="in" dot={`in:${socket.id}`} lit={lit} />
                  <span
                    className={cn(
                      "truncate text-2xs",
                      lit ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {socket.type === "Size" ? humanName(socket.name) : socket.name}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-col">
            {rowOutputs.map((socket) => {
              const lit = props.litOut === socket.id;
              return (
                <div
                  key={socket.id}
                  className={cn(
                    "relative flex cursor-crosshair items-center justify-end rounded-l-md pr-3",
                    lit ? "bg-primary/10" : null,
                  )}
                  style={{ height: SOCKET_ROW }}
                  onPointerDown={(event) => props.onWirePress(socket, event)}
                  onPointerEnter={() => onTrace({ socket: socket.id }, false)}
                  onPointerLeave={() => onTrace(null, false)}
                >
                  <span className="truncate text-2xs text-foreground">
                    {socket.type === "Size" ? humanName(socket.name) : socket.name}
                  </span>
                  <SocketDot type={socket.type} side="out" dot={`out:${socket.id}`} lit={lit} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {node.kind === "Shared" ? null : (
        <button
          type="button"
          onClick={props.onOpen}
          aria-label={`Open ${node.name} in the viewer`}
          className="relative mx-2 mb-2 flex h-28 items-center justify-center overflow-hidden rounded-md bg-(--model-ground) outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {drawn ? (
            <PreviewPicture body={preview.body} change={preview.change} typed={props.typed} />
          ) : props.picture ? (
            <img
              src={props.picture}
              alt=""
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          ) : (
            <span className="text-xs text-muted-foreground">No picture yet</span>
          )}
          {preview === undefined ? null : (
            <span className="absolute bottom-1 left-1.5 rounded bg-card/80 px-1 text-2xs text-muted-foreground">
              {preview.status === "working"
                ? "Previewing…"
                : (preview.note ??
                  (props.typed
                    ? "Filled: added. Pale: taken away."
                    : "Lit: what this size shapes"))}
            </span>
          )}
        </button>
      )}
      {props.sizes === null || sizeList.length === 0 ? null : (
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {shownSizes.map((size) => {
            const output = sized.get(size.name);
            const group = props.sizes;
            return (
              <SizeField
                key={size.name}
                size={size}
                lit={props.litOut === size.name}
                dot={
                  output === undefined
                    ? null
                    : {
                        key: `out:${output.id}`,
                        onPress: (event) => props.onWirePress(output, event),
                      }
                }
                onPoint={(pointing) => onTrace(pointing ? { socket: size.name } : null, false)}
                onEditing={(editing) => {
                  onTrace(editing ? { socket: size.name } : null, true);
                  if (!editing) props.onTyped(null);
                }}
                onTyped={props.onTyped}
                onChange={(text) =>
                  group === null ? Promise.resolve(false) : props.onChangeSize(group, size, text)
                }
              />
            );
          })}
          {ordered.length > shownSizes.length || allSizes ? (
            <button
              type="button"
              onClick={() => setAllSizes((before) => !before)}
              className="h-6 rounded-md text-2xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              {allSizes ? "Fewer sizes" : `All ${sizeList.length} sizes`}
            </button>
          ) : null}
        </div>
      )}
      {props.context.length === 0 && !addingLine ? null : (
        <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
          <span className="text-2xs text-muted-foreground">Must meet</span>
          {props.context.map((text, index) => (
            <div key={text} className="flex items-start gap-1 text-xs text-foreground">
              <span className="min-w-0 flex-1">{text}</span>
              <Button
                variant="ghost"
                size="icon-tiny"
                aria-label={`Remove ${text}`}
                onClick={() => props.onContext(props.context.filter((_, at) => at !== index))}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          {addingLine ? (
            <Input
              size="sm"
              autoFocus
              value={line}
              onChange={(event) => setLine(event.target.value)}
              onBlur={() => {
                if (line.trim() === "") setAddingLine(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") addLine();
                if (event.key === "Escape") setAddingLine(false);
              }}
              placeholder="A load, a material, a fit"
              aria-label={`Add what ${node.name} must meet`}
            />
          ) : null}
        </div>
      )}
      <div className="flex items-center gap-1 rounded-b-lg border-t border-border px-2 py-2">
        <Input
          size="sm"
          value={ask}
          disabled={!props.canChange}
          onChange={(event) => setAsk(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && ask.trim() !== "") {
              props.onChange(ask);
              setAsk("");
            }
          }}
          placeholder={`Change ${node.kind === "Shared" ? "these sizes" : "this part"}`}
          aria-label={`Change ${node.name}`}
        />
        {addingLine ? null : (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Add what ${node.name} must meet`}
            onClick={() => setAddingLine(true)}
          >
            <PlusIcon />
          </Button>
        )}
        <Button
          size="icon-xs"
          aria-label={`Send the change to ${node.name}`}
          disabled={!props.canChange || ask.trim() === ""}
          onClick={() => {
            props.onChange(ask);
            setAsk("");
          }}
        >
          <ArrowUpIcon />
        </Button>
      </div>
      {state === null ? null : (
        <p
          className={cn(
            "border-t border-border px-3 py-1.5 text-2xs",
            state === "Rebuilt" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {state}
        </p>
      )}
    </section>
  );
}

/**
 * A size inside a node, as a ComfyUI widget: its name and its number, which a click changes. A size
 * other parts take has its dot on the row's right edge, to draw a wire from. Pointing at it, or
 * typing over it, tells the canvas to follow it.
 */
function SizeField(props: {
  readonly size: NamedSize;
  readonly lit: boolean;
  readonly dot: {
    readonly key: string;
    readonly onPress: (event: PointerEvent<HTMLElement>) => void;
  } | null;
  readonly onPoint: (pointing: boolean) => void;
  readonly onEditing: (editing: boolean) => void;
  readonly onTyped: (text: string | null) => void;
  readonly onChange: (text: string) => Promise<boolean>;
}) {
  const { size } = props;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const edit = (on: boolean) => {
    setEditing(on);
    props.onEditing(on);
  };
  const save = async (typed: string) => {
    if (typed === size.text) {
      edit(false);
      return;
    }
    if (!SIZE_NUMBER.test(typed)) {
      toastManager.add({
        type: "error",
        title: `Couldn't change ${size.name}`,
        description: `${size.name} is a number here, like 12.5.`,
      });
      return;
    }
    setSaving(true);
    const done = await props.onChange(typed);
    setSaving(false);
    if (done) edit(false);
  };
  return (
    <div
      className={cn(
        "relative flex h-7 items-center gap-2 rounded-md px-2 text-xs",
        props.lit ? "bg-primary/10 ring-1 ring-primary/50 ring-inset" : "bg-muted/50",
      )}
      onPointerEnter={() => props.onPoint(true)}
      onPointerLeave={() => props.onPoint(false)}
    >
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          props.lit ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {humanName(size.name)}
      </span>
      {editing ? (
        <Input
          size="sm"
          autoFocus
          disabled={saving}
          defaultValue={size.text}
          className="w-20"
          aria-label={`${size.name}, Enter to change`}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            const text = event.currentTarget.value.trim();
            props.onTyped(SIZE_NUMBER.test(text) && text !== size.text ? text : null);
          }}
          onBlur={() => {
            if (!saving) edit(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") edit(false);
            else if (event.key === "Enter") void save(event.currentTarget.value.trim());
          }}
        />
      ) : size.editable ? (
        <button
          type="button"
          onClick={() => edit(true)}
          aria-label={`Change ${size.name}, now ${size.text}`}
          className="shrink-0 rounded px-1 text-foreground tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {size.text}
        </button>
      ) : (
        <span className="max-w-24 shrink-0 truncate text-muted-foreground">= {size.text}</span>
      )}
      {props.dot === null ? null : (
        <span
          className="absolute top-0 -right-2 bottom-0 w-4 cursor-crosshair"
          onPointerDown={props.dot.onPress}
        >
          <SocketDot type="Size" side="out" dot={props.dot.key} lit={props.lit} />
        </span>
      )}
    </div>
  );
}
