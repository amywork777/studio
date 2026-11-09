import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  ArrowUpIcon,
  BoxesIcon,
  BoxIcon,
  CopyPlusIcon,
  EyeOffIcon,
  FileIcon,
  ListPlusIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  SquareDashedIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { cn } from "~/lib/utils";
import { pluginEnvironment } from "~/state/plugins";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../../ui/menu";
import { toastManager } from "../../ui/toast";
import { CheckBadge, OutOfDateIcon } from "../CheckBadge";
import {
  checkOutOfDate,
  overviewParts,
  proposeFixPrompt,
  resultsFor,
  type CheckIssue,
  type CheckResult,
} from "../checkResults";
import { HARDWARE_ACTIONS, hardwareActions, type HardwareAction } from "../hardwareActions";
import { handToChat } from "../handToChat";
import { partLink } from "../partLink";
import { humanName } from "../partNames";
import { useChangeSize } from "../ProjectSizes";
import { folderFiles } from "../projectModels";
import { type NamedSize, type SizeGroup, SIZE_NUMBER } from "../sizes";
import { toolIcon } from "../toolIcons";
import { withToolLine } from "../toolUsed";
import { useFolderModels } from "../useFolderModels";
import { useFolderPaths } from "../useFolderPaths";
import { usePictures } from "../usePictures";
import { useProjectChecks } from "../useProjectChecks";
import { useProjectSizes } from "../useSizes";
import { useCadService } from "../useVersions";
import { isReviewPath, parseReview, reviewOwner, reviewPathFor } from "./dfmReview";
import { studyFigures, type Figure } from "./studyFigures";
import { CanvasMenu, type CanvasMenuItem } from "./CanvasMenu";
import { CompareDialog, type CompareColumn } from "./CompareDialog";
import {
  DRAFT_TITLES,
  draftFile,
  draftMade,
  draftPart,
  draftPrompt,
  draftSource,
  slugOf,
  variantOf,
  variantPrompt,
  type Draft,
  type DraftKind,
} from "./drafts";
import { outputFolder, outputOf, PRESET_FILES, printSettings } from "./jobOutputs";
import { useCardMeasure, type Dots } from "./useCardMeasure";
import {
  addChecks,
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
/** The view: the canvas is shifted by (x, y) and scaled by k. */
type View = { readonly x: number; readonly y: number; readonly k: number };

/**
 * The checks a node can add after a part: each way of making it the Toolbox checks (`dfm`,
 * `dfam-check`, SendCutSend's preflight) and its strength. They run as the Toolbox runs them.
 */
const CHECK_ACTIONS = HARDWARE_ACTIONS.filter(
  (action) =>
    action.id === "strength" ||
    action.id === "sendcutsend" ||
    (action.group === "Manufacture" && action.checks),
);

/** The check that makes a result named `check` ("CNC machining", "Strength"), to run it again. */
const actionFor = (check: string) => {
  const word = check.toLowerCase();
  return (
    CHECK_ACTIONS.find(
      (action) =>
        action.label.toLowerCase().includes(word) || action.process?.toLowerCase() === word,
    ) ?? null
  );
};

/** A check's name on its node: "CNC machining", "Sheet metal", "Strength under load". */
const checkName = (action: HardwareAction) => {
  const name = action.process ?? action.label.replace(/^Check (?:for|as) /, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** The Toolbox's job that finds an off-the-shelf part, which an off-the-shelf draft runs. */
const STOCK_ACTION = HARDWARE_ACTIONS.find((action) => action.id === "standard-parts");

/** The Toolbox's jobs that are about a result, not a part, so never follow one on the canvas. */
const ABOUT_RESULTS = new Set(["fea-results", "cam-results"]);

/** A job's block: what the job made for its part (none before it has run), and how it runs. */
interface JobNode {
  readonly id: string;
  readonly of: string;
  readonly name: string;
  readonly action: HardwareAction;
  /** The files it made, under `outputs/<job>/<part>/`. */
  readonly files: ReadonlyArray<string>;
}

/** A selection of cards: the ones picked, and the one to follow when it is one alone. */
type Picked = ReadonlySet<string>;

/** What the canvas's menu was opened on: the empty canvas at a point, or a card. */
type MenuAt = {
  readonly x: number;
  readonly y: number;
  readonly at: Spot;
  readonly on: string | null;
};

/** What deleting cards undoes back to. */
type Snapshot = {
  readonly drafts: ReadonlyArray<Draft>;
  readonly planned: ReadonlyArray<{ of: string; action: string }>;
  readonly hidden: ReadonlySet<string>;
};

const fileStem = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");

/** A check node: the result it shows (null before it has run), the part it is of, how it runs. */
interface CheckNode {
  readonly id: string;
  readonly of: string;
  readonly name: string;
  readonly result: CheckResult | null;
  readonly action: HardwareAction | null;
  /** A review the skill writes as Markdown (`dfmReview.ts`), saved where the node reads it. */
  readonly review: boolean;
}

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
  const [reviews, setReviews] = useState<ReadonlyArray<CheckResult>>([]);
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
    // Each manufacturing review, with when it was written, to say when its part changed since.
    void Promise.all(
      (paths ?? []).filter(isReviewPath).map(async (relativePath) => {
        const result = await read({ environmentId, input: { cwd: root, relativePath } });
        return result._tag === "Success"
          ? parseReview(relativePath, result.value.contents, result.value.modifiedAt)
          : null;
      }),
    ).then((found) => {
      if (live) setReviews(found.filter((review): review is CheckResult => review !== null));
    });
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
  const files = useMemo(() => overviewParts(folderFiles(paths ?? [], models)), [paths, models]);
  const parts = useMemo(() => graphParts(files, paths ?? []), [files, paths]);
  // Cards taken off the canvas: blocks with results and parts, which stay in the project.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const shownParts = useMemo(() => parts.filter((part) => !hidden.has(part.id)), [parts, hidden]);
  // The jobs the enabled plugins have skills for, as the Toolbox offers them.
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} }));
  const skills = useMemo(
    () =>
      new Set(
        (plugins.data?.plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : [])),
      ),
    [plugins.data],
  );
  const folders = useMemo(() => [root], [root]);
  const [checked] = useProjectChecks({ environmentId, folders, mutationId: props.mutationId });
  // The checks added on the canvas that have not run yet, by part and check.
  const [planned, setPlanned] = useState<ReadonlyArray<{ of: string; action: string }>>([]);
  const checks = useMemo(() => {
    const list: CheckNode[] = [];
    // The checks each part has been through: its studies, as the Overview lists them, and its
    // manufacturing reviews.
    for (const file of files) {
      for (const result of resultsFor(file, checked?.results ?? [])) {
        list.push({
          id: result.path,
          of: file.path,
          name: result.check,
          result,
          action: actionFor(result.check),
          review: false,
        });
      }
    }
    const scripted = parts.filter((part) => part.script.toLowerCase().endsWith(".py"));
    for (const review of reviews) {
      const of = reviewOwner(review.path, scripted);
      if (of === null) continue;
      list.push({
        id: review.path,
        of,
        name: review.check,
        result: review,
        action: actionFor(review.check),
        review: true,
      });
    }
    for (const plan of planned) {
      const action = CHECK_ACTIONS.find((held) => held.id === plan.action);
      const part = parts.find((held) => held.id === plan.of);
      if (action === undefined || part === undefined) continue;
      const review = action.skill !== "fea";
      const id = review ? reviewPathFor(part.script, action.id) : `${part.id}#${action.id}`;
      if (
        list.some((check) => check.id === id || (check.of === plan.of && check.action === action))
      ) {
        continue;
      }
      list.push({ id, of: plan.of, name: checkName(action), result: null, action, review });
    }
    return list;
  }, [files, parts, checked, reviews, planned]);
  const checkById = useMemo(() => new Map(checks.map((check) => [check.id, check])), [checks]);
  // Every other job's block: what it saved in `outputs/<job>/<part>/`, and the jobs added on the
  // canvas that have not made anything yet.
  const jobs = useMemo(() => {
    const byStem = new Map(parts.map((part) => [fileStem(part.script), part]));
    const found = new Map<string, { of: string; action: HardwareAction; files: string[] }>();
    for (const path of paths ?? []) {
      const made = outputOf(path);
      const part = made === null ? undefined : byStem.get(made.stem);
      const action = HARDWARE_ACTIONS.find((held) => held.id === made?.job);
      if (made === null || part === undefined || action === undefined) continue;
      const id = outputFolder(action.id, part.script);
      const entry = found.get(id) ?? { of: part.id, action, files: [] };
      entry.files.push(path);
      found.set(id, entry);
    }
    for (const plan of planned) {
      const action = HARDWARE_ACTIONS.find((held) => held.id === plan.action);
      const part = parts.find((held) => held.id === plan.of);
      if (action === undefined || part === undefined || CHECK_ACTIONS.includes(action)) continue;
      const id = outputFolder(action.id, part.script);
      if (!found.has(id)) found.set(id, { of: part.id, action, files: [] });
    }
    return [...found].map(([id, entry]): JobNode => ({
      id,
      of: entry.of,
      name: entry.action.label,
      action: entry.action,
      files: entry.files.toSorted(),
    }));
  }, [paths, parts, planned]);
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  // The settings saved with what a job made (a slicer's presets), read from its folder.
  const presetKey = jobs
    .flatMap((job) =>
      job.files.filter((file) => PRESET_FILES.some((name) => file === `${job.id}/${name}`)),
    )
    .join("\n");
  const [settings, setSettings] = useState<ReadonlyMap<string, ReadonlyArray<Figure>>>(new Map());
  useEffect(() => {
    let live = true;
    const presets = presetKey === "" ? [] : presetKey.split("\n");
    void Promise.all(
      presets.map(async (relativePath) => {
        const result = await read({ environmentId, input: { cwd: root, relativePath } });
        return [relativePath, result._tag === "Success" ? result.value.contents : null] as const;
      }),
    ).then((pairs) => {
      if (!live) return;
      const byFolder = new Map<string, Map<string, string>>();
      for (const [path, contents] of pairs) {
        if (contents === null) continue;
        const folder = path.slice(0, path.lastIndexOf("/"));
        const held = byFolder.get(folder) ?? new Map<string, string>();
        held.set(path.slice(folder.length + 1), contents);
        byFolder.set(folder, held);
      }
      setSettings(new Map([...byFolder].map(([folder, held]) => [folder, printSettings(held)])));
    });
    return () => {
      live = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Settings saved again (`mutationId`) are read again.
  }, [environmentId, read, root, presetKey, props.mutationId]);
  // Each variant and the part it copies, from the line its script starts with.
  const families = useMemo(() => {
    const byScript = new Map(parts.map((part) => [part.script, part]));
    const found = new Map<string, Array<{ id: string; change: string }>>();
    for (const [script, source] of sources) {
      const variant = variantOf(source);
      const original = variant === null ? undefined : byScript.get(variant.of);
      const copy = byScript.get(script);
      if (variant === null || original === undefined || copy === undefined) continue;
      found.set(original.id, [
        ...(found.get(original.id) ?? []),
        { id: copy.id, change: variant.change },
      ]);
    }
    return found;
  }, [parts, sources]);
  /** The part a card's part is a variant of, or the card's own part when it has variants. */
  const familyOf = (id: string): string | null => {
    if (families.has(id)) return id;
    for (const [original, variants] of families) {
      if (variants.some((variant) => variant.id === id)) return original;
    }
    return null;
  };
  // Parts added on the canvas before they exist, until the agent's script or STEP takes each's place.
  const [drafts, setDrafts] = useState<ReadonlyArray<Draft>>([]);
  const draftCount = useRef(0);
  const shownDrafts = useMemo(
    () => drafts.filter((draft) => !draftMade(draft, parts)),
    [drafts, parts],
  );
  const draftById = useMemo(
    () => new Map(shownDrafts.map((draft) => [draft.id, draft])),
    [shownDrafts],
  );
  const blocks = useMemo(
    () => [...checks, ...jobs].filter((block) => !hidden.has(block.id)),
    [checks, jobs, hidden],
  );
  const graph = useMemo(() => {
    const base = buildNodeGraph(shownParts, sources);
    if (shownDrafts.length === 0) return addChecks(base, blocks);
    const nodes = new Map(base.nodes.map((node) => [node.id, node]));
    const drafted = buildNodeGraph(
      [...shownParts, ...shownDrafts.map(draftPart)],
      new Map([
        ...sources,
        ...shownDrafts.map(
          (draft) => [draftPart(draft).script, draftSource(draft, nodes)] as const,
        ),
      ]),
    );
    return addChecks(drafted, blocks);
  }, [shownParts, sources, blocks, shownDrafts]);
  // A study's numbers, read from its result, and its picture (the stress map beside it).
  const studies = checks.flatMap((check) =>
    check.review || check.result === null ? [] : [check.result],
  );
  const studyKey = studies.map((study) => study.path).join("\n");
  const [figures, setFigures] = useState<ReadonlyMap<string, ReadonlyArray<Figure>>>(new Map());
  useEffect(() => {
    let live = true;
    void Promise.all(
      (studyKey === "" ? [] : studyKey.split("\n")).map(async (relativePath) => {
        const result = await read({ environmentId, input: { cwd: root, relativePath } });
        return [
          relativePath,
          result._tag === "Success" ? studyFigures(result.value.contents) : [],
        ] as const;
      }),
    ).then((pairs) => {
      if (live) setFigures(new Map(pairs));
    });
    return () => {
      live = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A study run again (`mutationId`) is read again.
  }, [environmentId, read, root, studyKey, props.mutationId]);
  const pictures = usePictures({
    environmentId,
    cwd: root,
    paths: [...parts.map((part) => part.id), ...studies.map((study) => study.model)],
    versions: Object.fromEntries(
      parts.flatMap((part) => (part.updated === null ? [] : [[part.id, part.updated]])),
    ),
  });

  const post = useCadService(props.threadRef);
  const [reads, setReads] = useState(0);
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

  // The cards picked (click, Shift-click, a box dragged with Shift); one alone is followed.
  const [picked, setPicked] = useState<Picked>(new Set());
  const selected = picked.size === 1 ? ([...picked][0] ?? null) : null;
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
    const checked = reach.users.filter((id) => checkById.has(id));
    const users = listOf(names(reach.users.filter((id) => !checkById.has(id))));
    const rebuilds = listOf(names(reach.rebuilds));
    const recheck =
      checked.length === 0
        ? ""
        : ` Then ${listOf(names(checked).map((check) => `the ${check.toLowerCase()} check`))} needs running again.`;
    if (users === "") {
      return node.kind === "Shared"
        ? `No part uses ${name} yet.`
        : `Changing ${name} rebuilds ${rebuilds}.${recheck}`;
    }
    return `${name} goes into ${users}. Changing it rebuilds ${rebuilds}.${recheck}`;
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

  // When each check was run from its node (seconds), to say it is running until its result is newer.
  const [ran, setRan] = useState<Record<string, number>>({});
  const runCheck = (check: CheckNode) => {
    const part = byId.get(check.of);
    const composerRef = props.composerRef;
    if (part === undefined || check.action === null || composerRef === null) return;
    // A manufacturing check's job already says where its review is saved (`reviewSuffix`).
    handToChat(composerRef, withToolLine(check.action.label, check.action.prompt(linkOf(part))));
    setRan((before) => ({ ...before, [check.id]: Date.now() / 1000 }));
  };
  const addDraft = (kind: DraftKind, at?: Spot) => {
    draftCount.current += 1;
    const id = `draft-${draftCount.current}`;
    setDrafts((before) => [...before, { id, kind, name: "", inputs: [], sent: null }]);
    if (at !== undefined) setMoved((before) => ({ ...before, [id]: at }));
    setPicked(new Set([id]));
  };
  // A variant of a part: a copy of its script with one change, taking what the part takes, below it.
  const addVariant = (id: string) => {
    const part = byId.get(id);
    if (part === undefined) return;
    draftCount.current += 1;
    const draftId = `draft-${draftCount.current}`;
    const taken = new Set([...parts, ...drafts].map((held) => slugOf(held.name)));
    const letter = [..."BCDEFGHJKLMNPQRSTUVWXYZ"].find(
      (held) => !taken.has(slugOf(`${part.name} ${held}`)),
    );
    setDrafts((before) => [
      ...before,
      {
        id: draftId,
        kind: "Variant",
        name: `${part.name} ${letter ?? "B"}`,
        inputs: (sockets.get(id)?.inputs ?? []).map((input) => ({
          from: input.from,
          socket: input.fromSocket,
        })),
        sent: null,
        variantOf: { id: part.id, script: part.script },
      },
    ]);
    const spot = spotOf(id);
    setMoved((before) => ({
      ...before,
      [draftId]: { x: spot.x, y: spot.y + (heights[id] ?? GUESS_H) + ROW_GAP },
    }));
    setPicked(new Set([draftId]));
  };
  // A job or check after a part, added as a block to run.
  const addAfter = (of: string, action: string) =>
    setPlanned((before) =>
      before.some((plan) => plan.of === of && plan.action === action)
        ? before
        : [...before, { of, action }],
    );
  // When each job was asked for from its block (seconds).
  const [jobAsked, setJobAsked] = useState<ReadonlySet<string>>(new Set());
  const runJob = (job: JobNode) => {
    const part = byId.get(job.of);
    const composerRef = props.composerRef;
    if (part === undefined || composerRef === null) return;
    // The job's ask says where it saves, and to use the settings already saved there.
    handToChat(composerRef, withToolLine(job.action.label, job.action.prompt(linkOf(part))));
    setJobAsked((before) => new Set([...before, job.id]));
  };

  // Deleting cards: a draft or a block not yet run goes; a part or a block with results is taken
  // off the canvas (its files stay), and "Show" brings it back. ⌘Z undoes the last.
  const [undo, setUndo] = useState<ReadonlyArray<Snapshot>>([]);
  const remember = () => setUndo((before) => [...before.slice(-19), { drafts, planned, hidden }]);
  const remove = (ids: ReadonlyArray<string>) => {
    if (ids.length === 0) return;
    remember();
    const unplanned = new Set<string>();
    const hide = new Set(hidden);
    for (const id of ids) {
      const check = checkById.get(id);
      const job = jobById.get(id);
      if (draftById.has(id)) continue;
      if (check !== undefined && check.result === null) {
        unplanned.add(`${check.of}>${check.action?.id ?? ""}`);
      } else if (job !== undefined && job.files.length === 0) {
        unplanned.add(`${job.of}>${job.action.id}`);
      } else {
        hide.add(id);
      }
    }
    setDrafts((before) => before.filter((draft) => !ids.includes(draft.id)));
    setPlanned((before) => before.filter((plan) => !unplanned.has(`${plan.of}>${plan.action}`)));
    setHidden(hide);
    setPicked(new Set());
  };
  /** Whether deleting a card removes it (a draft, a block not run) rather than taking it off. */
  const goes = (id: string) =>
    draftById.has(id) || checkById.get(id)?.result === null || jobById.get(id)?.files.length === 0;
  const undoRemove = () => {
    const last = undo.at(-1);
    if (last === undefined) return;
    setUndo(undo.slice(0, -1));
    setDrafts(last.drafts);
    setPlanned(last.planned);
    setHidden(last.hidden);
  };
  const showHidden = () => {
    remember();
    setHidden(new Set());
  };
  const updateDraft = (id: string, change: (draft: Draft) => Draft) =>
    setDrafts((before) => before.map((draft) => (draft.id === id ? change(draft) : draft)));
  const sendDraft = (draft: Draft, ask: string) => {
    const composerRef = props.composerRef;
    if (composerRef === null) return;
    const uses = draft.inputs.flatMap(({ from, socket }) => {
      const node = byId.get(from);
      if (node === undefined) return [];
      return [socket === SHAPE ? linkOf(node) : `${socket} from ${linkOf(node)}`];
    });
    const prompt = draftPrompt(draft, uses, ask);
    handToChat(
      composerRef,
      draft.kind === "Stock" && STOCK_ACTION !== undefined
        ? withToolLine(STOCK_ACTION.label, prompt)
        : prompt,
    );
    const at = Date.now() / 1000;
    updateDraft(draft.id, (held) => ({
      ...held,
      sent: { at, before: parts.map((part) => part.id) },
    }));
  };
  const sendVariant = (draft: Draft, ask: string) => {
    const composerRef = props.composerRef;
    const part = byId.get(draft.variantOf?.id ?? "");
    if (composerRef === null || part === undefined) return;
    // The checks the part has been through, asked of the variant as the Toolbox asks them.
    const copy = `[${draft.name.trim()}](${draftFile(draft)})`;
    const asks = checks.flatMap((check) =>
      check.of === part.id && check.result !== null && check.action !== null
        ? [check.action.prompt(copy)]
        : [],
    );
    handToChat(composerRef, variantPrompt(draft, linkOf(part), ask, [...new Set(asks)]));
    const at = Date.now() / 1000;
    updateDraft(draft.id, (held) => ({
      ...held,
      sent: { at, before: parts.map((known) => known.id) },
    }));
  };

  const proposeFix = (check: CheckNode, issue: CheckIssue) => {
    const part = byId.get(check.of);
    if (check.result === null || props.composerRef === null) return;
    handToChat(
      props.composerRef,
      proposeFixPrompt(check.result, issue, part === undefined ? undefined : linkOf(part)),
    );
  };

  // The canvas: pan by dragging the background or scrolling, zoom by pinching or Ctrl and scroll.
  const viewport = useRef<HTMLDivElement>(null);
  // Whether the canvas was moved or zoomed by hand, after which it no longer fits itself.
  const touched = useRef(false);
  // Bumped by "Tidy up", to lay the cards out and fit them again.
  const [tidy, setTidy] = useState(0);
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
        .join("|") + `#${graph.edges.length}#${tidy}`
    : null;
  useLayoutEffect(() => {
    if (layoutKey === null || touched.current) return;
    fit();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Fits again only when the layout changes.
  }, [layoutKey]);

  // What a press on the canvas is doing: panning it, dragging cards, boxing cards to pick, or
  // drawing a wire.
  const press = useRef<
    | { kind: "pan"; x: number; y: number; from: View; moved: boolean }
    | {
        kind: "node";
        id: string;
        shift: boolean;
        grip: ReadonlyArray<{ id: string; dx: number; dy: number }>;
        moved: boolean;
      }
    | { kind: "box"; from: Spot; add: Picked }
    | { kind: "wire"; from: string; socket: OutputSocket }
    | null
  >(null);
  const [drawing, setDrawing] = useState<{ from: string; socket: OutputSocket; to: Spot } | null>(
    null,
  );
  const [box, setBox] = useState<{ from: Spot; to: Spot } | null>(null);
  // Space held, to pan from anywhere, as in most canvases.
  const space = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panFrom = (event: PointerEvent<HTMLDivElement>) => {
    touched.current = true;
    press.current = { kind: "pan", x: event.clientX, y: event.clientY, from: view, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.button !== 0) return;
    viewport.current?.focus({ preventScroll: true });
    if (event.shiftKey) {
      const from = toCanvas(event.clientX, event.clientY);
      press.current = { kind: "box", from, add: picked };
      setBox({ from, to: from });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    panFrom(event);
  };
  // The middle button, or Space held, pans wherever it is pressed, over a card or not.
  const panAnywhere = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1 && !(space.current && event.button === 0)) return;
    event.preventDefault();
    event.stopPropagation();
    panFrom(event);
  };
  const startNode = (id: string, event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    viewport.current?.focus({ preventScroll: true });
    const at = toCanvas(event.clientX, event.clientY);
    // Dragging a picked card drags every picked card with it.
    const ids = picked.has(id) && !event.shiftKey ? [...picked] : [id];
    const grip = ids.map((held) => {
      const spot = spotOf(held);
      return { id: held, dx: at.x - spot.x, dy: at.y - spot.y };
    });
    press.current = { kind: "node", id, shift: event.shiftKey, grip, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const startWire = (from: string, socket: OutputSocket, event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    // Drawing a wire holds the canvas still: a fit while it lands would move cards under the pointer.
    touched.current = true;
    press.current = { kind: "wire", from, socket };
    setDrawing({ from, socket, to: toCanvas(event.clientX, event.clientY) });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const held = press.current;
    if (held === null) return;
    if (held.kind === "pan") {
      held.moved = held.moved || held.x !== event.clientX || held.y !== event.clientY;
      setView({
        ...held.from,
        x: held.from.x + event.clientX - held.x,
        y: held.from.y + event.clientY - held.y,
      });
    } else if (held.kind === "node") {
      held.moved = true;
      const at = toCanvas(event.clientX, event.clientY);
      setMoved((before) => ({
        ...before,
        ...Object.fromEntries(
          held.grip.map((grip) => [grip.id, { x: at.x - grip.dx, y: at.y - grip.dy }]),
        ),
      }));
    } else if (held.kind === "box") {
      setBox({ from: held.from, to: toCanvas(event.clientX, event.clientY) });
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
    if (held?.kind === "pan" && !held.moved && event.button === 0 && !space.current) {
      setPicked(new Set());
    }
    if (held?.kind === "node" && !held.moved) {
      setPicked((before) => {
        if (held.shift) {
          const next = new Set(before);
          if (next.has(held.id)) next.delete(held.id);
          else next.add(held.id);
          return next;
        }
        return before.size === 1 && before.has(held.id) ? new Set() : new Set([held.id]);
      });
    }
    if (held?.kind === "box") {
      setBox(null);
      const to = toCanvas(event.clientX, event.clientY);
      const left = Math.min(held.from.x, to.x);
      const right = Math.max(held.from.x, to.x);
      const top = Math.min(held.from.y, to.y);
      const bottom = Math.max(held.from.y, to.y);
      const inside = graph.nodes.flatMap((node) => {
        const spot = spotOf(node.id);
        const height = heights[node.id] ?? GUESS_H;
        return spot.x < right && spot.x + NODE_W > left && spot.y < bottom && spot.y + height > top
          ? [node.id]
          : [];
      });
      setPicked(new Set([...held.add, ...inside]));
    }
    if (held?.kind === "wire") {
      setDrawing(null);
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const from = byId.get(held.from);
      const to = target === undefined ? undefined : byId.get(target);
      if (from === undefined || to === undefined || to.id === from.id) return;
      // Into a part not made yet, a wire is something it will use, said when it is asked for.
      const draft = draftById.get(to.id);
      if (draft !== undefined) {
        if (
          draft.kind === "Stock" ||
          draft.kind === "Variant" ||
          draft.sent !== null ||
          draftById.has(from.id)
        ) {
          return;
        }
        const socket = held.socket.id;
        // It stays where it was dropped on, not moved to the column its new input puts it in.
        const spot = spotOf(draft.id);
        setMoved((before) =>
          before[draft.id] === undefined ? { ...before, [draft.id]: spot } : before,
        );
        updateDraft(draft.id, (made) =>
          made.inputs.some((input) => input.from === from.id && input.socket === socket)
            ? made
            : { ...made, inputs: [...made.inputs, { from: from.id, socket }] },
        );
        return;
      }
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

  // The canvas's keys, while it (or nothing else) has focus: Delete takes the picked cards off,
  // ⌘Z puts them back, ⌘A picks every card, F fits the view, Escape lets go, the arrows nudge, and
  // Space held pans.
  const [menu, setMenu] = useState<MenuAt | null>(null);
  useEffect(() => {
    const ours = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return false;
      if (target.closest("input, textarea, select, [contenteditable='true']") !== null)
        return false;
      return target === document.body || viewport.current?.contains(target) === true;
    };
    const down = (event: KeyboardEvent) => {
      if (!ours(event)) return;
      const command = event.metaKey || event.ctrlKey;
      if (event.key === " ") {
        // A focused button keeps Space for pressing it.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        space.current = true;
        setSpaceHeld(true);
      } else if ((event.key === "Delete" || event.key === "Backspace") && !command) {
        event.preventDefault();
        remove([...picked]);
      } else if (command && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undoRemove();
      } else if (command && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setPicked(new Set(graph.nodes.map((node) => node.id)));
      } else if (event.key === "Escape") {
        setMenu(null);
        setPicked(new Set());
      } else if (event.key.toLowerCase() === "f" && !command && !event.altKey) {
        fit();
      } else if (event.key.startsWith("Arrow") && picked.size > 0) {
        event.preventDefault();
        const step = event.shiftKey ? 40 : 8;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        setMoved((before) => ({
          ...before,
          ...Object.fromEntries(
            [...picked].map((id) => {
              const spot = before[id] ?? spotOf(id);
              return [id, { x: spot.x + dx, y: spot.y + dy }];
            }),
          ),
        }));
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      space.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });
  // Puts the cards back where the layout puts them, and fits the view to them.
  const tidyUp = () => {
    setMoved({});
    touched.current = false;
    setTidy((before) => before + 1);
  };
  // Opens the menu where the pointer is: on a card, what can be done to it (it is picked first);
  // on the empty canvas, what can be added there.
  const openMenu = (clientX: number, clientY: number, on: string | null) => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (bounds === undefined) return;
    if (on !== null && !picked.has(on)) setPicked(new Set([on]));
    setMenu({
      x: Math.max(8, Math.min(clientX - bounds.left, bounds.width - 264)),
      y: Math.max(8, Math.min(clientY - bounds.top, bounds.height - 392)),
      at: toCanvas(clientX, clientY),
      on,
    });
  };
  // The jobs a part's kind can be followed by, as the Toolbox's menus list them, by menu.
  const jobItems = (id: string): CanvasMenuItem[] => {
    const node = byId.get(id);
    if (node === undefined || (node.kind !== "Part" && node.kind !== "Assembly")) return [];
    return hardwareActions(node.kind, skills).flatMap((group) =>
      [...group.sections, ...group.others].flatMap((section) =>
        section.actions
          .filter((action) => !ABOUT_RESULTS.has(action.id))
          .map((action) => ({
            id: `${group.group}:${action.id}`,
            label: action.label,
            group: group.group,
            icon: toolIcon(action),
            onPick: () => addAfter(id, action.id),
          })),
      ),
    );
  };
  const menuItems = (at: MenuAt): CanvasMenuItem[] => {
    const many = picked.size > 1;
    const targets = at.on !== null && !picked.has(at.on) ? [at.on] : [...picked];
    // A part, or a block with results, is only taken off the canvas: its files stay.
    const kept = targets.some((id) => !goes(id));
    const removeItem: CanvasMenuItem = {
      id: "remove",
      label: `${kept ? "Take off the canvas" : "Delete"}${many ? ` (${picked.size})` : ""}`,
      group: "Card",
      icon: kept ? EyeOffIcon : Trash2Icon,
      keys: "⌫",
      onPick: () => remove(targets),
    };
    if (at.on === null) {
      return [
        ...(["Part", "Assembly", "Stock"] as const).map((kind) => ({
          id: kind,
          label: DRAFT_TITLES[kind],
          group: "Add here",
          icon: DRAFT_ICONS[kind],
          onPick: () => addDraft(kind, at.at),
        })),
        ...(picked.size > 0 ? [removeItem] : []),
        {
          id: "fit",
          label: "Fit to view",
          group: "Canvas",
          icon: MaximizeIcon,
          keys: "F",
          onPick: fit,
        },
        { id: "tidy", label: "Tidy up", group: "Canvas", icon: SquareDashedIcon, onPick: tidyUp },
        ...(hidden.size === 0
          ? []
          : [
              {
                id: "show",
                label: `Show ${hidden.size} taken off`,
                group: "Canvas",
                icon: EyeOffIcon,
                onPick: showHidden,
              },
            ]),
      ];
    }
    const node = byId.get(at.on);
    if (node === undefined) return [];
    const part = node.kind === "Part" || node.kind === "Assembly";
    const family = familyOf(at.on);
    return [
      ...(part && !many
        ? [
            {
              id: "variant",
              label: "Make a variant",
              group: "Card",
              icon: CopyPlusIcon,
              onPick: () => addVariant(node.id),
            },
            ...(family === null
              ? []
              : [
                  {
                    id: "compare",
                    label: "Compare variants",
                    group: "Card",
                    icon: CopyPlusIcon,
                    onPick: () => setComparing(family),
                  },
                ]),
          ]
        : []),
      removeItem,
      ...(part && !many ? jobItems(node.id) : []),
    ];
  };
  const [comparing, setComparing] = useState<string | null>(null);
  const compareColumns = (original: string): CompareColumn[] => {
    const members = [
      { id: original, change: null },
      ...(families.get(original) ?? []).map((variant) => ({
        id: variant.id,
        change: variant.change,
      })),
    ];
    return members.flatMap(({ id, change }) => {
      const part = parts.find((held) => held.id === id);
      if (part === undefined) return [];
      const found = new Map(
        checks.flatMap((check) =>
          check.of === id && check.result !== null
            ? [
                [
                  check.name,
                  {
                    result: check.result,
                    figures: figures.get(check.result.path) ?? [],
                    outOfDate:
                      part.updated !== null &&
                      checkOutOfDate(check.result, { version: part.updated }),
                  },
                ] as const,
              ]
            : [],
        ),
      );
      return [{ id, name: part.name, change, picture: pictures.get(id), checks: found }];
    });
  };

  if (paths === null) {
    return <p className="px-6 py-8 text-sm text-muted-foreground">Reading the project…</p>;
  }
  if (graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 px-6 py-8">
        <p className="text-sm text-muted-foreground">
          No parts yet. Add one here, or once the agent builds one, it shows here as a node.
        </p>
        <AddMenu onAdd={addDraft} />
      </div>
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
      tabIndex={-1}
      className={cn(
        "relative min-h-0 flex-1 touch-none overflow-hidden outline-none select-none",
        spaceHeld ? "cursor-grab active:cursor-grabbing" : "cursor-default",
      )}
      style={{
        backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
        backgroundSize: `${20 * view.k}px ${20 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDownCapture={panAnywhere}
      onPointerDown={startPan}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) openMenu(event.clientX, event.clientY, null);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const target = event.target instanceof Element ? event.target : null;
        const on = target?.closest<HTMLElement>("[data-node]")?.dataset.node ?? null;
        openMenu(event.clientX, event.clientY, on);
      }}
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
        {box === null ? null : (
          <div
            aria-hidden
            className="absolute rounded-sm border border-primary bg-primary/10"
            style={{
              left: Math.min(box.from.x, box.to.x),
              top: Math.min(box.from.y, box.to.y),
              width: Math.abs(box.to.x - box.from.x),
              height: Math.abs(box.to.y - box.from.y),
            }}
          />
        )}
        {graph.nodes.map((node) => {
          const check = checkById.get(node.id);
          const measure = {
            onHeight: (height: number) =>
              setHeights((before) =>
                Math.abs((before[node.id] ?? 0) - height) < 1
                  ? before
                  : { ...before, [node.id]: height },
              ),
            onDots: (found: Dots) =>
              setDots((before) =>
                sameDots(before[node.id], found) ? before : { ...before, [node.id]: found },
              ),
          };
          const draft = draftById.get(node.id);
          if (draft !== undefined) {
            return (
              <DraftCard
                key={node.id}
                node={node}
                draft={draft}
                spot={spotOf(node.id)}
                inputs={sockets.get(node.id)?.inputs ?? []}
                role={roleOf(node.id)}
                litIn={(sockets.get(node.id)?.inputs ?? []).flatMap((input) =>
                  tracing(input, node.id) ? [input.id] : [],
                )}
                picked={picked.has(node.id)}
                variantOfName={byId.get(draft.variantOf?.id ?? "")?.name ?? null}
                dropTarget={
                  drawing !== null &&
                  draft.kind !== "Stock" &&
                  draft.kind !== "Variant" &&
                  draft.sent === null
                }
                canSend={props.composerRef !== null}
                {...measure}
                onTrace={(next) => setHovered(next)}
                onNodePress={(event) => startNode(node.id, event)}
                onName={(name) => updateDraft(draft.id, (held) => ({ ...held, name }))}
                onUnwire={(input) =>
                  updateDraft(draft.id, (held) => ({
                    ...held,
                    inputs: held.inputs.filter(
                      (wired) => wired.from !== input.from || wired.socket !== input.fromSocket,
                    ),
                  }))
                }
                onSend={(ask) =>
                  draft.kind === "Variant" ? sendVariant(draft, ask) : sendDraft(draft, ask)
                }
                onRemove={() =>
                  setDrafts((before) => before.filter((held) => held.id !== draft.id))
                }
              />
            );
          }
          const job = jobById.get(node.id);
          if (job !== undefined) {
            const part = byId.get(job.of);
            return (
              <JobCard
                key={node.id}
                node={node}
                job={job}
                partName={part?.name ?? "the part"}
                settings={settings.get(job.id) ?? []}
                picked={picked.has(node.id)}
                spot={spotOf(node.id)}
                inputs={sockets.get(node.id)?.inputs ?? []}
                role={roleOf(node.id)}
                litIn={(sockets.get(node.id)?.inputs ?? []).flatMap((input) =>
                  tracing(input, node.id) ? [input.id] : [],
                )}
                icon={toolIcon(job.action)}
                asked={jobAsked.has(node.id)}
                canRun={props.composerRef !== null}
                {...measure}
                onTrace={(next) => setHovered(next)}
                onNodePress={(event) => startNode(node.id, event)}
                onOpenFile={(path) => props.onOpen(root, path)}
                onRun={() => runJob(job)}
                onRemove={() => remove([node.id])}
              />
            );
          }
          if (check !== undefined) {
            const part = byId.get(check.of);
            const result = check.result;
            return (
              <CheckCard
                key={node.id}
                node={node}
                check={check}
                partName={part?.name ?? "The part"}
                picked={picked.has(node.id)}
                figures={result === null ? [] : (figures.get(result.path) ?? [])}
                picture={result === null || check.review ? undefined : pictures.get(result.model)}
                spot={spotOf(node.id)}
                inputs={sockets.get(node.id)?.inputs ?? []}
                role={roleOf(node.id)}
                litIn={(sockets.get(node.id)?.inputs ?? []).flatMap((input) =>
                  tracing(input, node.id) ? [input.id] : [],
                )}
                outOfDate={
                  result !== null &&
                  part !== undefined &&
                  part.updated !== null &&
                  checkOutOfDate(result, { version: part.updated })
                }
                running={ran[node.id] !== undefined && (result?.written ?? 0) < (ran[node.id] ?? 0)}
                canRun={props.composerRef !== null && check.action !== null}
                {...measure}
                onTrace={(next) => setHovered(next)}
                onNodePress={(event) => startNode(node.id, event)}
                onOpen={() => {
                  if (result !== null) props.onOpen(root, result.model);
                }}
                onRun={() => runCheck(check)}
                onFix={(issue) => proposeFix(check, issue)}
                onRemove={
                  result === null
                    ? () =>
                        setPlanned((before) =>
                          before.filter(
                            (plan) => plan.of !== check.of || plan.action !== check.action?.id,
                          ),
                        )
                    : null
                }
              />
            );
          }
          return (
            <NodeCard
              key={node.id}
              node={node}
              spot={spotOf(node.id)}
              inputs={sockets.get(node.id)?.inputs ?? []}
              outputs={sockets.get(node.id)?.outputs ?? []}
              sizes={sizeGroups.get(node.script) ?? null}
              picture={pictures.get(node.id)}
              context={context[node.script] ?? []}
              selected={picked.has(node.id)}
              family={(() => {
                const original = familyOf(node.id);
                if (original === null) return null;
                const variant = families.get(original)?.find((held) => held.id === node.id);
                return variant === undefined
                  ? `${families.get(original)?.length ?? 0} variants`
                  : `Variant of ${byId.get(original)?.name ?? "a part"}: ${variant.change}`;
              })()}
              onCompare={() => {
                const original = familyOf(node.id);
                if (original !== null) setComparing(original);
              }}
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
              onDots={measure.onDots}
              canAdd={node.kind === "Part" || node.kind === "Assembly"}
              onMenu={(x, y) => openMenu(x, y, node.id)}
              dropTarget={drawing !== null && drawing.from !== node.id}
              asked={asked[node.id]}
              askedBy={byId.get(asked[node.id]?.by ?? "")?.name}
              canChange={props.composerRef !== null}
              onHeight={measure.onHeight}
              onOpen={() => props.onOpen(root, node.kind === "Shared" ? node.script : node.id)}
              onContext={(lines) => void saveContext({ ...context, [node.script]: lines })}
              onChange={(ask) => change(node, ask)}
              onChangeSize={(group, size, text) => changeSize(root, group.file, size, text)}
              onNodePress={(event) => startNode(node.id, event)}
              onWirePress={(socket, event) => startWire(node.id, socket, event)}
            />
          );
        })}
      </div>
      <div className="absolute top-3 left-3">
        <AddMenu onAdd={addDraft} />
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
        <Button variant="ghost" size="icon-xs" aria-label="Fit to view (F)" onClick={fit}>
          <MaximizeIcon />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Tidy up" onClick={tidyUp}>
          <SquareDashedIcon />
        </Button>
        {undo.length === 0 ? null : (
          <Button variant="ghost" size="icon-xs" aria-label="Undo delete (⌘Z)" onClick={undoRemove}>
            <Undo2Icon />
          </Button>
        )}
      </div>
      {hidden.size === 0 ? null : (
        <div className="absolute top-3 right-3 flex items-center gap-2 rounded-lg border border-border bg-popover py-1 pr-1 pl-3 text-xs text-muted-foreground shadow-xs">
          <EyeOffIcon aria-hidden className="size-3.5" />
          {hidden.size} taken off the canvas
          <Button variant="ghost" size="xs" onClick={showHidden}>
            Show
          </Button>
        </div>
      )}
      {menu === null ? null : (
        <CanvasMenu
          x={menu.x}
          y={menu.y}
          title={
            menu.on === null
              ? "Add here"
              : picked.size > 1
                ? `${picked.size} cards`
                : `After ${byId.get(menu.on)?.name ?? "this"}`
          }
          items={menuItems(menu)}
          onClose={() => setMenu(null)}
        />
      )}
      <CompareDialog
        open={comparing !== null}
        columns={comparing === null ? [] : compareColumns(comparing)}
        onOpenChange={(open) => {
          if (!open) setComparing(null);
        }}
        onOpenResult={(path) => props.onOpen(root, path)}
      />
      {traceLine === null ? (
        <p className="pointer-events-none absolute right-3 bottom-3 text-xs text-muted-foreground">
          Point at a size to see where it goes. Drag a dot onto another node to use it there.
          Double-click to add, right-click a card for more.
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
  /** Whether jobs can follow it ("Add after"), which opens the canvas's menu on it. */
  readonly canAdd: boolean;
  readonly onMenu: (clientX: number, clientY: number) => void;
  /** Its variants ("2 variants") or what it changes as one, to compare them; null for neither. */
  readonly family: string | null;
  readonly onCompare: () => void;
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
  // Measured after every layout: the size rows move as sizes load and open out.
  const card = useCardMeasure(props.onHeight, props.onDots);

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
      {props.family === null ? null : (
        <div className="flex items-center gap-1 border-b border-border py-0.5 pr-1 pl-3">
          <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
            {props.family}
          </span>
          <Button variant="ghost" size="xs" onClick={props.onCompare}>
            Compare
          </Button>
        </div>
      )}
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
        {props.canAdd ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Add after ${node.name}`}
            onClick={(event) => {
              const at = event.currentTarget.getBoundingClientRect();
              props.onMenu(at.left, at.bottom + 4);
            }}
          >
            <ListPlusIcon />
          </Button>
        ) : null}
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

/** What a draft of each kind is drawn with, as the Toolbox draws the same jobs. */
const DRAFT_ICONS = {
  Part: BoxIcon,
  Assembly: BoxesIcon,
  Stock: STOCK_ACTION === undefined ? BoxIcon : toolIcon(STOCK_ACTION),
  Variant: CopyPlusIcon,
} as const;

/** Adds a part, an assembly or an off-the-shelf part to the canvas, to wire up and ask for. */
function AddMenu(props: { readonly onAdd: (kind: DraftKind) => void }) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="sm" />}>
        <PlusIcon />
        Add
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" sideOffset={6}>
        {(["Part", "Assembly", "Stock"] as const).map((kind) => {
          const Icon = DRAFT_ICONS[kind];
          return (
            <MenuItem key={kind} onClick={() => props.onAdd(kind)}>
              <Icon />
              {DRAFT_TITLES[kind]}
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}

/**
 * A part, assembly or off-the-shelf part not made yet: its name, what is wired into it (drag a
 * size's or a part's dot onto it), and what it is, sent as one ask. Once asked it says so until
 * the agent's part takes its place.
 */
function DraftCard(props: {
  readonly node: GraphNode;
  readonly draft: Draft;
  readonly spot: Spot;
  readonly inputs: ReadonlyArray<InputSocket>;
  readonly role: TraceRole | null;
  readonly litIn: ReadonlyArray<string>;
  readonly dropTarget: boolean;
  readonly picked: boolean;
  /** For a variant, the part it copies. */
  readonly variantOfName: string | null;
  readonly canSend: boolean;
  readonly onHeight: (height: number) => void;
  readonly onDots: (dots: Dots) => void;
  readonly onTrace: (pointed: Trace | null) => void;
  readonly onNodePress: (event: PointerEvent<HTMLElement>) => void;
  readonly onName: (name: string) => void;
  readonly onUnwire: (input: InputSocket) => void;
  readonly onSend: (ask: string) => void;
  readonly onRemove: () => void;
}) {
  const { node, draft } = props;
  const [ask, setAsk] = useState("");
  const card = useCardMeasure(props.onHeight, props.onDots);
  const stock = draft.kind === "Stock";
  const variant = draft.kind === "Variant";
  const sent = draft.sent !== null;
  const ready = props.canSend && !sent && ask.trim() !== "" && (stock || slugOf(draft.name) !== "");
  const send = () => {
    if (!ready) return;
    props.onSend(ask);
  };
  const Icon = DRAFT_ICONS[draft.kind];

  return (
    <section
      ref={card}
      data-node={node.id}
      aria-label={node.name}
      className={cn(
        "pointer-events-auto absolute flex cursor-default flex-col rounded-lg border border-dashed bg-card shadow-md",
        props.role === "apart"
          ? "border-border opacity-50"
          : props.picked
            ? "border-primary ring-2 ring-primary/40"
            : props.dropTarget || props.role !== null
              ? "border-primary/60"
              : "border-border",
      )}
      style={{ left: props.spot.x, top: props.spot.y, width: NODE_W }}
    >
      <header
        className="flex cursor-grab items-center gap-2 rounded-t-lg border-b border-border bg-muted/60 px-3 active:cursor-grabbing"
        style={{ height: HEADER_H }}
        onPointerDown={props.onNodePress}
      >
        <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium text-foreground">{node.name}</span>
        <span className="ml-auto shrink-0 text-2xs text-muted-foreground">Not made yet</span>
        <Button
          variant="ghost"
          size="icon-tiny"
          aria-label={`Remove ${node.name}`}
          onClick={props.onRemove}
        >
          <XIcon />
        </Button>
      </header>
      {stock ? null : (
        <div
          className="flex flex-col"
          style={{ paddingTop: SOCKETS_TOP, paddingBottom: SOCKETS_TOP }}
        >
          {props.inputs.map((socket) => {
            const lit = props.litIn.includes(socket.id);
            return (
              <div
                key={socket.id}
                className={cn(
                  "relative flex items-center gap-1 rounded-r-md pl-3 pr-1",
                  lit ? "bg-primary/10" : null,
                )}
                style={{ height: SOCKET_ROW }}
                onPointerEnter={() =>
                  props.onTrace({ from: socket.from, socket: socket.fromSocket, to: node.id })
                }
                onPointerLeave={() => props.onTrace(null)}
              >
                <SocketDot type={socket.type} side="in" dot={`in:${socket.id}`} lit={lit} />
                <span className="min-w-0 flex-1 truncate text-2xs text-foreground">
                  {socket.type === "Size" ? humanName(socket.name) : socket.name}
                </span>
                {sent || variant ? null : (
                  <Button
                    variant="ghost"
                    size="icon-tiny"
                    aria-label={`Stop using ${socket.name}`}
                    onClick={() => props.onUnwire(socket)}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            );
          })}
          {sent ? null : (
            <p className="px-3 py-1 text-2xs text-muted-foreground">
              {variant
                ? `A copy of ${props.variantOfName ?? "the part"} with one change, checked as it is.`
                : draft.kind === "Assembly"
                  ? "Drag each part's dot here to put it in."
                  : "Drag a size's or a part's dot here to use it."}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5 rounded-b-lg border-t border-border px-2 py-2">
        {stock ? null : (
          <Input
            size="sm"
            value={draft.name}
            disabled={sent}
            onChange={(event) => props.onName(event.target.value)}
            placeholder={draft.kind === "Assembly" ? "Name, as Belt drive" : "Name, as Belt clamp"}
            aria-label={`Name of the ${DRAFT_TITLES[draft.kind].toLowerCase()}`}
          />
        )}
        <div className="flex items-center gap-1">
          <Input
            size="sm"
            value={ask}
            disabled={sent || !props.canSend}
            onChange={(event) => setAsk(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
            placeholder={
              stock
                ? "What to find, as an M3 x 10 socket head screw"
                : variant
                  ? "What changes, as 6 mm thick, not 8"
                  : draft.kind === "Assembly"
                    ? "How they go together"
                    : "What it is and what it must do"
            }
            aria-label={`What ${node.name} is`}
          />
          <Button
            size="icon-xs"
            aria-label={`Ask for ${node.name}`}
            disabled={!ready}
            onClick={send}
          >
            <ArrowUpIcon />
          </Button>
        </div>
        {sent ? (
          <p className="px-1 text-2xs text-muted-foreground">
            {stock ? "Finding it." : "Building it."} It shows here once the agent has made it.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** What each Toolbox menu's jobs are drawn in, as the Toolbox colours kinds. */
const GROUP_HUES = {
  Evaluate: "var(--kind-analysis)",
  Manufacture: "var(--kind-manufacturing)",
  Document: "var(--kind-document)",
} as const;
/** A job's block lists this many of the files it made; the rest open from its folder. */
const FILES_SHOWN = 5;

/**
 * Any Toolbox job after a part, fed by its shape: what it made for the part (kept in
 * `outputs/<job>/<part>/`), the settings saved with it (a slicer's presets), and the job to run
 * again, as the Toolbox runs it, with those settings. Before it has run it says what it makes.
 */
function JobCard(props: {
  readonly node: GraphNode;
  readonly job: JobNode;
  readonly partName: string;
  /** The job's icon, as its Toolbox tile draws it. */
  readonly icon: LucideIcon;
  readonly settings: ReadonlyArray<Figure>;
  readonly picked: boolean;
  readonly spot: Spot;
  readonly inputs: ReadonlyArray<InputSocket>;
  readonly role: TraceRole | null;
  readonly litIn: ReadonlyArray<string>;
  /** Whether it was asked for from this block, to say its files show once saved. */
  readonly asked: boolean;
  readonly canRun: boolean;
  readonly onHeight: (height: number) => void;
  readonly onDots: (dots: Dots) => void;
  readonly onTrace: (pointed: Trace | null) => void;
  readonly onNodePress: (event: PointerEvent<HTMLElement>) => void;
  readonly onOpenFile: (path: string) => void;
  readonly onRun: () => void;
  readonly onRemove: () => void;
}) {
  const { node, job } = props;
  const card = useCardMeasure(props.onHeight, props.onDots);
  const Icon = props.icon;
  // The presets show as its settings, not as files.
  const made = job.files.filter(
    (file) =>
      props.settings.length === 0 || !PRESET_FILES.some((name) => file === `${job.id}/${name}`),
  );
  const shown = made.slice(0, FILES_SHOWN);

  return (
    <section
      ref={card}
      data-node={node.id}
      aria-label={job.name}
      className={cn(
        "pointer-events-auto absolute flex cursor-default flex-col rounded-lg border bg-card shadow-md",
        props.role === "user"
          ? "border-primary ring-1 ring-primary/30"
          : props.role === "apart"
            ? "border-border opacity-50"
            : props.picked
              ? "border-primary ring-2 ring-primary/40"
              : "border-border",
      )}
      style={{ left: props.spot.x, top: props.spot.y, width: NODE_W }}
    >
      <header
        className="flex cursor-grab items-center gap-2 rounded-t-lg border-b border-border bg-muted/60 px-3 active:cursor-grabbing"
        style={{ height: HEADER_H }}
        onPointerDown={props.onNodePress}
      >
        <Icon
          aria-hidden
          className="size-3.5 shrink-0"
          style={{ color: GROUP_HUES[job.action.group] }}
        />
        <span className="truncate text-xs font-medium text-foreground">{job.name}</span>
        <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{job.action.group}</span>
        <Button
          variant="ghost"
          size="icon-tiny"
          aria-label={`Delete ${job.name}`}
          onClick={props.onRemove}
        >
          <XIcon />
        </Button>
      </header>
      <div
        className="flex flex-col"
        style={{ paddingTop: SOCKETS_TOP, paddingBottom: SOCKETS_TOP }}
      >
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
                props.onTrace({ from: socket.from, socket: socket.fromSocket, to: node.id })
              }
              onPointerLeave={() => props.onTrace(null)}
            >
              <SocketDot type={socket.type} side="in" dot={`in:${socket.id}`} lit={lit} />
              <span
                className={cn(
                  "truncate text-2xs",
                  lit ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {socket.name}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
        {job.files.length === 0 ? (
          <>
            <p className="text-xs text-muted-foreground">{job.action.gets}</p>
            <p className="text-2xs text-muted-foreground">Not run yet</p>
          </>
        ) : (
          <>
            {shown.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => props.onOpenFile(file)}
                className="flex min-w-0 items-center gap-1.5 rounded-sm text-left text-xs text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <FileIcon aria-hidden className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.split("/").pop()}</span>
              </button>
            ))}
            {made.length > shown.length ? (
              <span className="text-2xs text-muted-foreground">
                {made.length - shown.length} more in {job.id}
              </span>
            ) : null}
            {props.settings.length === 0 ? null : (
              <>
                <span className="pt-1 text-2xs text-muted-foreground">Settings saved with it</span>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-2xs">
                  {props.settings.map((item) => (
                    <div key={item.label} className="contents">
                      <dt className="text-muted-foreground">{item.label}</dt>
                      <dd className="min-w-0 truncate text-foreground tabular-nums">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </>
        )}
        {props.asked ? (
          <p className="text-2xs text-muted-foreground">
            Asked the agent. What it makes for {props.partName} shows here once it is saved.
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1 rounded-b-lg border-t border-border px-2 py-2">
        <Button variant="outline" size="xs" disabled={!props.canRun} onClick={props.onRun}>
          {job.files.length === 0
            ? "Run"
            : props.settings.length === 0
              ? "Run again"
              : "Run again with these settings"}
        </Button>
      </div>
    </section>
  );
}

/** A check node shows this many of its findings; the rest are in its result. */
const FINDINGS_SHOWN = 3;

/**
 * A check after a part, fed by its shape: how its last run went (`CheckBadge`, out of date once the
 * part has changed since), the findings to fix or look at, each with "Propose a fix", and the check
 * to run again, as the Toolbox runs it. Before it has run it says "Not checked".
 */
function CheckCard(props: {
  readonly node: GraphNode;
  readonly check: CheckNode;
  readonly partName: string;
  readonly picked: boolean;
  /** A study's numbers as its result gives them, and its picture. */
  readonly figures: ReadonlyArray<Figure>;
  readonly picture: string | undefined;
  readonly spot: Spot;
  readonly inputs: ReadonlyArray<InputSocket>;
  readonly role: TraceRole | null;
  readonly litIn: ReadonlyArray<string>;
  readonly outOfDate: boolean;
  readonly running: boolean;
  readonly canRun: boolean;
  readonly onHeight: (height: number) => void;
  readonly onDots: (dots: Dots) => void;
  readonly onTrace: (pointed: Trace | null) => void;
  readonly onNodePress: (event: PointerEvent<HTMLElement>) => void;
  readonly onOpen: () => void;
  readonly onRun: () => void;
  readonly onFix: (issue: CheckIssue) => void;
  /** Takes a check not yet run off the canvas; null once it has a result. */
  readonly onRemove: (() => void) | null;
}) {
  const { node, check } = props;
  const result = check.result;
  const card = useCardMeasure(props.onHeight, props.onDots);
  const shown = result?.issues.slice(0, FINDINGS_SHOWN) ?? [];
  const more = (result?.issues.length ?? 0) - shown.length;

  return (
    <section
      ref={card}
      data-node={node.id}
      aria-label={`${check.name} check`}
      className={cn(
        "pointer-events-auto absolute flex cursor-default flex-col rounded-lg border bg-card shadow-md",
        props.role === "user"
          ? "border-primary ring-1 ring-primary/30"
          : props.role === "apart"
            ? "border-border opacity-50"
            : props.picked
              ? "border-primary ring-2 ring-primary/40"
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
          style={{
            backgroundColor:
              check.action?.skill === "fea" ? "var(--kind-analysis)" : "var(--kind-manufacturing)",
          }}
        />
        <span className="truncate text-xs font-medium text-foreground">{check.name}</span>
        <span className="ml-auto shrink-0 text-2xs text-muted-foreground">Check</span>
        {props.onRemove === null ? null : (
          <Button
            variant="ghost"
            size="icon-tiny"
            aria-label={`Remove the ${check.name} check`}
            onClick={props.onRemove}
          >
            <XIcon />
          </Button>
        )}
      </header>
      <div
        className="flex flex-col"
        style={{ paddingTop: SOCKETS_TOP, paddingBottom: SOCKETS_TOP }}
      >
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
                props.onTrace({ from: socket.from, socket: socket.fromSocket, to: node.id })
              }
              onPointerLeave={() => props.onTrace(null)}
            >
              <SocketDot type={socket.type} side="in" dot={`in:${socket.id}`} lit={lit} />
              <span
                className={cn(
                  "truncate text-2xs",
                  lit ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {socket.name}
              </span>
            </div>
          );
        })}
      </div>
      {props.picture === undefined ? null : (
        <button
          type="button"
          onClick={props.onOpen}
          aria-label={`Open the ${check.name.toLowerCase()} result`}
          className="relative mx-2 mb-2 flex h-28 items-center justify-center overflow-hidden rounded-md bg-(--model-ground) outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <img
            src={props.picture}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        </button>
      )}
      <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2">
        {result === null ? (
          <p className="text-xs text-muted-foreground">Not checked</p>
        ) : (
          <>
            <div className="min-w-0">
              <CheckBadge result={result} outOfDate={props.outOfDate} onOpen={props.onOpen} />
            </div>
            {props.outOfDate ? (
              <p className="flex items-start gap-1 text-2xs text-muted-foreground">
                <OutOfDateIcon aria-hidden className="mt-px size-3 shrink-0" />
                {props.partName} changed since this check. These results are from before.
              </p>
            ) : null}
            <p className="text-xs text-foreground">{result.headline}</p>
            {props.figures.length === 0 ? null : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-2xs">
                {props.figures.map((item) => (
                  <div key={item.label} className="contents">
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="min-w-0 text-foreground tabular-nums">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {shown.map((issue) => (
              <div key={issue.summary} className="flex flex-col gap-0.5">
                <div className="flex items-start gap-1">
                  <span className="min-w-0 flex-1 text-xs text-foreground">{issue.summary}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={!props.canRun}
                    onClick={() => props.onFix(issue)}
                  >
                    Propose a fix
                  </Button>
                </div>
                {issue.fix === null ? null : (
                  <p className="line-clamp-2 text-2xs text-muted-foreground">{issue.fix}</p>
                )}
              </div>
            ))}
            {more <= 0 ? null : (
              <button
                type="button"
                onClick={props.onOpen}
                className="self-start rounded-sm text-2xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                {more} more in the result
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-1 rounded-b-lg border-t border-border px-2 py-2">
        <Button
          variant="outline"
          size="xs"
          disabled={!props.canRun || props.running}
          onClick={props.onRun}
        >
          {props.running ? "Checking…" : result === null ? "Run check" : "Run again"}
        </Button>
        {result === null ? null : (
          <Button variant="ghost" size="xs" onClick={props.onOpen}>
            Open result
          </Button>
        )}
      </div>
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
