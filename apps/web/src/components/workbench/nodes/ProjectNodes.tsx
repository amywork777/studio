import type { EnvironmentId } from "@t3tools/contracts";
import { ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { cn } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { toastManager } from "../../ui/toast";
import { handToChat } from "../handToChat";
import { overviewParts } from "../checkResults";
import { partLink } from "../partLink";
import { folderFiles } from "../projectModels";
import { useFolderModels } from "../useFolderModels";
import { useFolderPaths } from "../useFolderPaths";
import { usePictures } from "../usePictures";
import {
  buildNodeGraph,
  downstream,
  nodePrompt,
  upstream,
  type GraphNode,
  graphParts,
} from "./nodeGraph";
import { CONTEXT_FILE, readPartContext, writePartContext, type PartContext } from "./partContext";

const CARD_W = 264;
const COL_GAP = 72;
const ROW_H = 300;
const PAD = 24;
/** At most this many scripts are read for their imports. */
const MOST_SCRIPTS = 120;

/** Where a node sits on the canvas: its column and row, or where it was dragged. */
type Spot = { readonly x: number; readonly y: number };
const home = (node: GraphNode): Spot => ({
  x: PAD + node.column * (CARD_W + COL_GAP),
  y: PAD + node.row * ROW_H,
});

/**
 * The Nodes prototype: the project's parts as cards wired by what their scripts import, after
 * ComfyUI. Each card holds what its part must meet and changes that part alone: its message names
 * the one script to edit, and the parts wired after it rebuild. A prototype on its own branch.
 */
export function ProjectNodes(props: {
  readonly environmentId: EnvironmentId;
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

  const [moved, setMoved] = useState<Record<string, Spot>>({});
  const spotOf = (node: GraphNode) => moved[node.id] ?? home(node);
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
    const link =
      node.kind === "Shared"
        ? `[${node.name}](${node.script})`
        : partLink({ path: node.id, name: node.name });
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

  // Dragging a card by its title.
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  // A drag that moved the card is not also a click that selects it.
  const dragged = useRef(false);
  const startDrag = (node: GraphNode, event: PointerEvent<HTMLElement>) => {
    const spot = spotOf(node);
    dragged.current = false;
    drag.current = { id: node.id, dx: event.clientX - spot.x, dy: event.clientY - spot.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const held = drag.current;
    if (held === null) return;
    dragged.current = true;
    setMoved((before) => ({
      ...before,
      [held.id]: {
        x: Math.max(0, event.clientX - held.dx),
        y: Math.max(0, event.clientY - held.dy),
      },
    }));
  };
  const endDrag = () => {
    drag.current = null;
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

  const spots = new Map(graph.nodes.map((node) => [node.id, spotOf(node)]));
  const width = Math.max(...[...spots.values()].map((spot) => spot.x)) + CARD_W + PAD;
  const height = Math.max(...[...spots.values()].map((spot) => spot.y)) + ROW_H + PAD;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-6 pt-4 text-xs text-muted-foreground">
        Each part changes on its own. A wire means one script imports the other, and everything to
        the right of a change rebuilds after it. Drag a card by its name.
      </p>
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{
            width,
            height,
            backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={width}
            height={height}
            aria-hidden
          >
            {graph.edges.map((edge) => {
              const from = spots.get(edge.from);
              const to = spots.get(edge.to);
              if (from === undefined || to === undefined) return null;
              const x1 = from.x + CARD_W;
              const y1 = from.y + 28;
              const x2 = to.x;
              const y2 = to.y + 28;
              const bend = Math.max(40, (x2 - x1) / 2);
              const lit =
                selected !== null &&
                (edge.from === selected || following.has(edge.from)) &&
                following.has(edge.to);
              return (
                <path
                  key={`${edge.from}>${edge.to}`}
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  className={lit ? "stroke-primary" : "stroke-muted-foreground/40"}
                  strokeWidth={lit ? 2 : 1.5}
                />
              );
            })}
          </svg>
          {graph.nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              spot={spots.get(node.id) ?? home(node)}
              picture={pictures.get(node.id)}
              context={context[node.script] ?? []}
              selected={selected === node.id}
              follows={following.has(node.id)}
              asked={asked[node.id]}
              askedBy={byId.get(asked[node.id]?.by ?? "")?.name}
              canChange={props.composerRef !== null}
              onSelect={() => {
                if (dragged.current) return;
                setSelected((before) => (before === node.id ? null : node.id));
              }}
              onOpen={() => props.onOpen(root, node.kind === "Shared" ? node.script : node.id)}
              onContext={(lines) => void saveContext({ ...context, [node.script]: lines })}
              onChange={(ask) => change(node, ask)}
              onDragStart={(event) => startDrag(node, event)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function NodeCard(props: {
  readonly node: GraphNode;
  readonly spot: Spot;
  readonly picture: string | undefined;
  readonly context: ReadonlyArray<string>;
  readonly selected: boolean;
  readonly follows: boolean;
  readonly asked: { at: number; by: string } | undefined;
  readonly askedBy: string | undefined;
  readonly canChange: boolean;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
  readonly onContext: (lines: ReadonlyArray<string>) => void;
  readonly onChange: (ask: string) => void;
  readonly onDragStart: (event: PointerEvent<HTMLElement>) => void;
}) {
  const { node } = props;
  const [line, setLine] = useState("");
  const [ask, setAsk] = useState("");
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
  };

  return (
    <section
      aria-label={node.name}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-lg border bg-card shadow-xs",
        props.selected
          ? "border-primary ring-1 ring-primary"
          : props.follows
            ? "border-primary/50"
            : "border-border",
      )}
      style={{ left: props.spot.x, top: props.spot.y, width: CARD_W }}
    >
      <header
        className="flex cursor-grab touch-none items-center gap-2 border-b border-border px-3 py-2 active:cursor-grabbing"
        onPointerDown={props.onDragStart}
        onClick={props.onSelect}
      >
        <span className="truncate text-sm font-medium text-foreground">{node.name}</span>
        <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
          {node.kind === "Shared" ? "Shared values" : node.kind}
        </span>
      </header>
      {node.kind === "Shared" ? null : (
        <button
          type="button"
          onClick={props.onOpen}
          aria-label={`Open ${node.name} in the viewer`}
          className="flex h-24 items-center justify-center bg-(--model-ground) outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {props.picture ? (
            <img src={props.picture} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">No picture yet</span>
          )}
        </button>
      )}
      <div className="flex flex-col gap-1.5 px-3 py-2">
        <span className="text-2xs text-muted-foreground">Must meet</span>
        {props.context.length === 0 ? (
          <span className="text-xs text-muted-foreground/70">Nothing yet</span>
        ) : (
          <ul className="flex flex-col gap-1">
            {props.context.map((text, index) => (
              <li key={text} className="flex items-start gap-1 text-xs text-foreground">
                <span className="min-w-0 flex-1">{text}</span>
                <Button
                  variant="ghost"
                  size="icon-tiny"
                  aria-label={`Remove ${text}`}
                  onClick={() => props.onContext(props.context.filter((_, at) => at !== index))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-1">
          <Input
            size="sm"
            value={line}
            onChange={(event) => setLine(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addLine();
            }}
            placeholder="A load, a material, a fit"
            aria-label={`Add what ${node.name} must meet`}
          />
          <Button variant="ghost" size="icon-sm" aria-label="Add" onClick={addLine}>
            <PlusIcon />
          </Button>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1 border-t border-border px-3 py-2">
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
          placeholder={`Change ${node.kind === "Shared" ? "these values" : "this part"}`}
          aria-label={`Change ${node.name}`}
        />
        <Button
          size="icon-sm"
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
