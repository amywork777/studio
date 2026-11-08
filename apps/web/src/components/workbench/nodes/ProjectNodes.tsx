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
  upstream,
  wirePrompt,
  type GraphNode,
  type InputSocket,
  type OutputSocket,
  type SocketType,
} from "./nodeGraph";
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

  const outputSpot = (id: string, socket: string): Spot | null => {
    const index = sockets.get(id)?.outputs.findIndex((held) => held.id === socket) ?? -1;
    if (index < 0) return null;
    const spot = spotOf(id);
    return { x: spot.x + NODE_W, y: spot.y + socketY(index) };
  };
  const wires = graph.nodes.flatMap((node) =>
    (sockets.get(node.id)?.inputs ?? []).flatMap((input, index) => {
      const start = outputSpot(input.from, input.fromSocket);
      if (start === null) return [];
      const spot = spotOf(node.id);
      return [{ input, to: node.id, start, end: { x: spot.x, y: spot.y + socketY(index) } }];
    }),
  );
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
            const lit =
              selected !== null &&
              (input.from === selected || following.has(input.from)) &&
              following.has(to);
            return (
              <path
                key={`${input.id}>${to}`}
                d={curve(start, finish)}
                fill="none"
                stroke={WIRE[input.type]}
                strokeOpacity={selected === null || lit ? 0.9 : 0.25}
                strokeWidth={lit ? 3 : 2}
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
      <p className="pointer-events-none absolute right-3 bottom-3 text-xs text-muted-foreground">
        Drag a dot onto another node to use it there
      </p>
    </div>
  );
}

/** A wire from an output to an input, bending out of the one and into the other as ComfyUI's do. */
function curve(start: Spot, end: Spot): string {
  const bend = Math.max(48, Math.abs(end.x - start.x) / 2);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

function SocketDot(props: { readonly type: SocketType; readonly side: "in" | "out" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border-2 border-card",
        props.side === "in" ? "-left-[5px]" : "-right-[5px]",
      )}
      style={{ backgroundColor: WIRE[props.type] }}
    />
  );
}

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
  readonly asked: { at: number; by: string } | undefined;
  readonly askedBy: string | undefined;
  readonly canChange: boolean;
  readonly onHeight: (height: number) => void;
  readonly onOpen: () => void;
  readonly onContext: (lines: ReadonlyArray<string>) => void;
  readonly onChange: (ask: string) => void;
  readonly onChangeSize: (group: SizeGroup, size: NamedSize, text: string) => Promise<boolean>;
  readonly onNodePress: (event: PointerEvent<HTMLElement>) => void;
  readonly onWirePress: (socket: OutputSocket, event: PointerEvent<HTMLElement>) => void;
}) {
  const { node } = props;
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
  const rows = Math.max(props.inputs.length, props.outputs.length);
  const sizeList = props.sizes?.sizes ?? [];
  const shownSizes = allSizes ? sizeList : sizeList.slice(0, SIZES_SHOWN);

  return (
    <section
      ref={card}
      data-node={node.id}
      aria-label={node.name}
      className={cn(
        "pointer-events-auto absolute flex cursor-default flex-col rounded-lg border bg-card shadow-md",
        props.selected
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
            {props.inputs.map((socket) => (
              <div
                key={socket.id}
                className="relative flex items-center pl-3"
                style={{ height: SOCKET_ROW }}
              >
                <SocketDot type={socket.type} side="in" />
                <span className="truncate text-2xs text-muted-foreground">
                  {socket.type === "Size" ? humanName(socket.name) : socket.name}
                </span>
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            {props.outputs.map((socket) => (
              <div
                key={socket.id}
                className="relative flex cursor-crosshair items-center justify-end pr-3"
                style={{ height: SOCKET_ROW }}
                onPointerDown={(event) => props.onWirePress(socket, event)}
              >
                <span className="truncate text-2xs text-foreground">
                  {socket.type === "Size" ? humanName(socket.name) : socket.name}
                </span>
                <SocketDot type={socket.type} side="out" />
              </div>
            ))}
          </div>
        </div>
      )}
      {node.kind === "Shared" ? null : (
        <button
          type="button"
          onClick={props.onOpen}
          aria-label={`Open ${node.name} in the viewer`}
          className="mx-2 mb-2 flex h-28 items-center justify-center rounded-md bg-(--model-ground) outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {props.picture ? (
            <img
              src={props.picture}
              alt=""
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
          ) : (
            <span className="text-xs text-muted-foreground">No picture yet</span>
          )}
        </button>
      )}
      {props.sizes === null || sizeList.length === 0 ? null : (
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {shownSizes.map((size) => (
            <SizeField
              key={size.name}
              size={size}
              onChange={(text) =>
                props.sizes === null
                  ? Promise.resolve(false)
                  : props.onChangeSize(props.sizes, size, text)
              }
            />
          ))}
          {sizeList.length > SIZES_SHOWN ? (
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

/** A size inside a node, as a ComfyUI widget: its name and its number, which a click changes. */
function SizeField(props: {
  readonly size: NamedSize;
  readonly onChange: (text: string) => Promise<boolean>;
}) {
  const { size } = props;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async (typed: string) => {
    if (typed === size.text) {
      setEditing(false);
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
    if (done) setEditing(false);
  };
  return (
    <div className="flex h-7 items-center gap-2 rounded-md bg-muted/50 px-2 text-xs">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{humanName(size.name)}</span>
      {editing ? (
        <Input
          size="sm"
          autoFocus
          disabled={saving}
          defaultValue={size.text}
          className="w-20"
          aria-label={`${size.name}, Enter to change`}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={() => {
            if (!saving) setEditing(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
            else if (event.key === "Enter") void save(event.currentTarget.value.trim());
          }}
        />
      ) : size.editable ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Change ${size.name}, now ${size.text}`}
          className="shrink-0 rounded px-1 text-foreground tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {size.text}
        </button>
      ) : (
        <span className="max-w-24 shrink-0 truncate text-muted-foreground">= {size.text}</span>
      )}
    </div>
  );
}
