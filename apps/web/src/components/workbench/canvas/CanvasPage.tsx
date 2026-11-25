import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ImagePlusIcon,
  LayoutGridIcon,
  MaximizeIcon,
  MessageSquareIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import {
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useStableCallback } from "~/hooks/useStableCallback";
import { pluginEnvironment } from "~/state/plugins";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Button } from "../../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../../ui/menu";
import { SidebarInset } from "../../ui/sidebar";
import { Textarea } from "../../ui/textarea";
import { toastManager } from "../../ui/toast";
import { StudioTopBar } from "../StudioTopBar";
import { useFolderModels } from "../useFolderModels";
import { openPartInCad } from "../useOpenInWorkbench";
import {
  CARD,
  type DesignOption,
  INPUT,
  OPTIONS_PER_SET,
  optionPlaces,
  type Place,
} from "./canvasOptions";
import { type CanvasBoard, type CanvasPicture, previewOf, useCanvasStore } from "./canvasStore";
import { OptionCard, PendingCard } from "./OptionCard";
import { type MeshSize, START_ANGLE, type ViewAngle } from "./meshView";
import { useBoardOptions, useBoardWorking } from "./useCanvasOptions";
import { useCanvasMake } from "./useCanvasMake";

/** Where the first set of options starts, right of what they were made from. */
const OPTIONS_ORIGIN: Place = { x: INPUT.width + 140, y: 0 };
const ZOOM = { min: 0.2, max: 2.5 } as const;

const joinPath = (folder: string, file: string) =>
  `${folder.replace(/[\\/]+$/, "")}${folder.includes("\\") && !folder.includes("/") ? "\\" : "/"}${file}`;

/**
 * Studio's canvas: a board to explore on, not to edit. Pictures and words go on it, Make options
 * asks the agent for four design options of the part, and each arrives as a live 3D card beside
 * the others, at one scale and turned together. A double-click opens one as real CAD in its
 * project; More like this asks for four more grown from it.
 */
export function CanvasPage() {
  const environmentId = usePrimaryEnvironmentId();
  const boards = useCanvasStore((state) => state.boards);
  const current = useCanvasStore((state) => state.current);
  const startBoard = useCanvasStore((state) => state.startBoard);
  const board = boards.find((candidate) => candidate.id === current) ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a first visit has no board in this device's store yet; one is made there
  useEffect(() => {
    if (environmentId !== null && board === null) startBoard(environmentId);
  }, [environmentId, board, startBoard]);
  if (environmentId === null || board === null) return null;
  return <Board key={board.id} environmentId={environmentId} board={board} />;
}

function Board(props: { readonly environmentId: EnvironmentId; readonly board: CanvasBoard }) {
  const { environmentId, board } = props;
  const navigate = useNavigate();
  const update = useCanvasStore((state) => state.update);
  const { makeFirst, makeMore } = useCanvasMake(environmentId);
  const working = useBoardWorking(environmentId, board.threadId);
  const { options, stamp } = useBoardOptions({ environmentId, folder: board.folder, working });
  const models = useFolderModels(environmentId, board.folder ?? "");
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const [sending, setSending] = useState(false);
  const [asked, setAsked] = useState<{ readonly from: string | null; readonly count: number }>({
    from: null,
    count: board.threadId === null ? 0 : OPTIONS_PER_SET,
  });
  const [angle, setAngle] = useState<ViewAngle>(START_ANGLE);
  const [sizes, setSizes] = useState<ReadonlyMap<string, MeshSize>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState(board.view);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const onSize = useStableCallback((key: string, size: MeshSize) => {
    setSizes((last) => new Map(last).set(key, size));
  });

  // One scale for every card, so a bigger option looks bigger.
  const radius = sizes.size === 0 ? null : Math.max(...[...sizes.values()].map((s) => s.radius));
  const masses = options.flatMap((option) => (option.massGrams === null ? [] : [option.massGrams]));
  const lightest = masses.length > 1 ? Math.min(...masses) : null;

  const placed = optionPlaces(options, OPTIONS_ORIGIN);
  const placeOf = (key: string): Place => board.moved[key] ?? placed.get(key) ?? OPTIONS_ORIGIN;
  const picturePlace = (picture: CanvasPicture, index: number): Place =>
    board.moved[picture.id] ?? { x: 0, y: pictureTop(index) };
  const pictureTop = (index: number) =>
    board.pictures.slice(0, index).reduce((top, picture) => top + pictureHeight(picture) + 24, 0);

  const placedPictures = board.pictures.map((picture, index) => picturePlace(picture, index));
  const inputLeft = placedPictures.length === 0 ? 0 : Math.min(...placedPictures.map((p) => p.x));
  const inputTop = placedPictures.length === 0 ? 0 : Math.min(...placedPictures.map((p) => p.y));
  const briefTop =
    placedPictures.length === 0
      ? 0
      : Math.max(
          ...board.pictures.map(
            (picture, index) => placedPictures[index]!.y + pictureHeight(picture),
          ),
        ) + 24;

  // The cards still being built: the set asked last, less those it has listed.
  const listedFromAsked = options.filter((option) => option.from === asked.from).length;
  const pending = working ? Math.max(0, asked.count - listedFromAsked) : 0;
  const pendingPlaces = pendingSlots({
    options,
    from: asked.from,
    count: pending,
    placeOf,
  });

  const saveView = (next: typeof view) => {
    setView(next);
    update(board.id, () => ({ view: next }));
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a wheel listener that can prevent the page's own scroll and zoom needs a non-passive native listener
  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = surface.getBoundingClientRect();
      setView((last) => {
        let next = last;
        if (event.ctrlKey || event.metaKey) {
          const zoom = clamp(last.zoom * Math.exp(-event.deltaY * 0.01), ZOOM.min, ZOOM.max);
          const px = event.clientX - rect.left;
          const py = event.clientY - rect.top;
          next = {
            zoom,
            x: px - ((px - last.x) / last.zoom) * zoom,
            y: py - ((py - last.y) / last.zoom) * zoom,
          };
        } else {
          next = { ...last, x: last.x - event.deltaX, y: last.y - event.deltaY };
        }
        return next;
      });
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, []);

  // The view is kept with the board a moment after it stops moving.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the settled pan and zoom to this device's store, which is outside React
  useEffect(() => {
    const timer = setTimeout(() => update(board.id, () => ({ view })), 400);
    return () => clearTimeout(timer);
  }, [view, board.id, update]);

  const panning = useRef<{ x: number; y: number; view: typeof view } | null>(null);
  const onSurfaceDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    setSelected(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    panning.current = { x: event.clientX, y: event.clientY, view };
  };
  const onSurfaceMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = panning.current;
    if (start === null) return;
    setView({
      ...start.view,
      x: start.view.x + event.clientX - start.x,
      y: start.view.y + event.clientY - start.y,
    });
  };

  const fit = () => {
    const surface = surfaceRef.current;
    if (surface === null) return;
    const boxes: Array<{ x: number; y: number; w: number; h: number }> = [
      ...board.pictures.map((picture, index) => ({
        x: board.moved[picture.id]?.x ?? 0,
        y: board.moved[picture.id]?.y ?? pictureTop(index),
        w: INPUT.width,
        h: pictureHeight(picture),
      })),
      ...(board.description.trim() !== "" && board.threadId !== null
        ? [{ x: inputLeft, y: briefTop, w: INPUT.width, h: 120 }]
        : []),
      ...options.map((option) => ({ ...placeOf(option.key), w: CARD.width, h: CARD.height })),
      ...pendingPlaces.map((place) => ({ ...place, w: CARD.width, h: CARD.height })),
    ];
    if (boxes.length === 0) {
      saveView({ x: surface.clientWidth / 2 - INPUT.width / 2, y: 120, zoom: 1 });
      return;
    }
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    const pad = 96;
    const zoom = clamp(
      Math.min(
        (surface.clientWidth - pad * 2) / (right - left),
        (surface.clientHeight - pad * 2 - 120) / (bottom - top),
      ),
      ZOOM.min,
      1.25,
    );
    saveView({
      zoom,
      x: (surface.clientWidth - (right - left) * zoom) / 2 - left * zoom,
      y: (surface.clientHeight - 120 - (bottom - top) * zoom) / 2 - top * zoom,
    });
  };

  // A new set of cards is framed with what it was made from.
  const [refit, setRefit] = useState(0);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- frames the board after the new cards have laid out in the DOM
  useEffect(() => {
    if (refit > 0) fit();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- only a new set asked for reframes the board
  }, [refit]);
  // A new board, or one opened for the first time here, starts framed on what is on it.
  const framed = useRef(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- frames the board once its surface has a size in the DOM
  useEffect(() => {
    if (framed.current || board.view.zoom !== 1 || board.view.x !== 0 || board.view.y !== 0) return;
    framed.current = true;
    fit();
  });

  const addFiles = async (files: ReadonlyArray<File>, at: Place | null) => {
    const pictures: CanvasPicture[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toastManager.add({
          type: "warning",
          title: `${file.name} is not a picture`,
          description: "The canvas takes sketches, photos and drawings as pictures for now.",
        });
        continue;
      }
      const preview = await previewOf(file).catch(() => null);
      if (preview === null) continue;
      const index = board.pictures.length + pictures.length;
      const place = at ?? { x: 0, y: pictureTop(board.pictures.length) };
      pictures.push({
        id: `picture-${Date.now().toString(36)}-${index}`,
        name: file.name,
        path: window.desktopBridge?.getPathForFile?.(file) || null,
        preview,
        place: { x: place.x, y: place.y + pictures.length * 40 },
      });
    }
    if (pictures.length === 0) return;
    update(board.id, (last) => ({
      pictures: [...last.pictures, ...pictures],
      moved: {
        ...last.moved,
        ...Object.fromEntries(pictures.map((picture) => [picture.id, picture.place])),
      },
    }));
  };

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const at = {
      x: (event.clientX - rect.left - view.x) / view.zoom - INPUT.width / 2,
      y: (event.clientY - rect.top - view.y) / view.zoom - 80,
    };
    void addFiles([...event.dataTransfer.files], at);
  };

  const make = async () => {
    if (sending) return;
    setSending(true);
    const sent = await makeFirst(board).finally(() => setSending(false));
    if (sent) {
      setAsked({ from: null, count: OPTIONS_PER_SET });
      setRefit((count) => count + 1);
    }
  };

  const more = async (option: DesignOption) => {
    if (sending || working) return;
    setSending(true);
    const taken = options.map((candidate) => candidate.key);
    const sent = await makeMore(board, option, taken).finally(() => setSending(false));
    if (sent) {
      setAsked({ from: option.key, count: OPTIONS_PER_SET });
      setRefit((count) => count + 1);
    }
  };

  const threadRef =
    board.threadId === null ? null : scopeThreadRef(environmentId, board.threadId as ThreadId);

  const openOption = (option: DesignOption) => {
    if (threadRef === null || board.folder === null) return;
    const script = option.script;
    const model =
      option.model ??
      models.find((candidate) => candidate.script === script)?.id ??
      models.find((candidate) => candidate.script.endsWith(script))?.id ??
      null;
    if (model === null) {
      toastManager.add({
        type: "warning",
        title: `${option.name} is not built yet`,
        description: "It opens once the agent has built its script.",
      });
      return;
    }
    openPartInCad(plugins, threadRef, model);
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) });
  };

  const openChat = () => {
    if (threadRef === null) return;
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) });
  };

  const started = board.threadId !== null;
  const empty = board.pictures.length === 0 && !started;
  const showBrief = started && board.description.trim() !== "";
  const inputAnchor: Place = {
    x: inputLeft + INPUT.width,
    y: (inputTop + briefTop + (showBrief ? 120 : -24)) / 2,
  };

  // One line from what a set was made from to the set's first card: the row reads as the set.
  const setStarts = new Map<string | null, Place>();
  for (const option of options) {
    if (!setStarts.has(option.from)) setStarts.set(option.from, placeOf(option.key));
  }
  if (pendingPlaces[0] !== undefined && !setStarts.has(asked.from)) {
    setStarts.set(asked.from, pendingPlaces[0]);
  }
  const setLinks = [...setStarts].flatMap(([from, start]) => {
    if (from === null) {
      if (board.pictures.length === 0 && !showBrief) return [];
      return [
        {
          key: "first",
          from: inputAnchor,
          to: { x: start.x, y: start.y + CARD.height / 2 },
          vertical: false,
        },
      ];
    }
    const parent = placeOf(from);
    return [
      {
        key: `more-${from}`,
        from: { x: parent.x + CARD.width / 2, y: parent.y + CARD.height },
        to: { x: start.x + CARD.width / 2, y: start.y },
        vertical: true,
      },
    ];
  });

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background">
        <StudioTopBar>
          <BoardBar board={board} onOpenChat={threadRef === null ? null : openChat} />
        </StudioTopBar>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={surfaceRef}
            className="relative min-h-0 flex-1 cursor-default touch-none overflow-hidden select-none"
            style={{
              backgroundImage: "radial-gradient(circle, var(--border) 1.2px, transparent 1.2px)",
              backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
              backgroundPosition: `${view.x}px ${view.y}px`,
            }}
            onPointerDown={onSurfaceDown}
            onPointerMove={onSurfaceMove}
            onPointerUp={() => {
              if (panning.current !== null) saveView(view);
              panning.current = null;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
          >
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
            >
              <svg
                className="pointer-events-none absolute top-0 left-0 overflow-visible"
                width="1"
                height="1"
              >
                {setLinks.map((link) => (
                  <Connector
                    key={link.key}
                    from={link.from}
                    to={link.to}
                    vertical={link.vertical}
                  />
                ))}
              </svg>
              {board.pictures.map((picture, index) => (
                <PictureCard
                  key={picture.id}
                  picture={picture}
                  place={picturePlace(picture, index)}
                  zoom={view.zoom}
                  onMove={(place) =>
                    update(board.id, (last) => ({ moved: { ...last.moved, [picture.id]: place } }))
                  }
                />
              ))}
              {showBrief ? (
                <div
                  className="absolute rounded-2xl border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm"
                  style={{ left: inputLeft, top: briefTop, width: INPUT.width }}
                >
                  <div className="mb-1 text-xs text-muted-foreground">Brief</div>
                  <p className="line-clamp-4">{board.description}</p>
                </div>
              ) : null}
              {options.map((option) => (
                <OptionCard
                  key={option.key}
                  environmentId={environmentId}
                  option={option}
                  meshPath={joinPath(board.folder ?? "", option.glb)}
                  stamp={stamp}
                  place={placeOf(option.key)}
                  zoom={view.zoom}
                  angle={angle}
                  onAngle={setAngle}
                  radius={radius}
                  onSize={onSize}
                  lightest={lightest !== null && option.massGrams === lightest}
                  selected={selected === option.key}
                  onSelect={() => setSelected(option.key)}
                  onOpen={() => openOption(option)}
                  onMore={working ? null : () => void more(option)}
                  onMove={(place) =>
                    update(board.id, (last) => ({ moved: { ...last.moved, [option.key]: place } }))
                  }
                />
              ))}
              {pendingPlaces.map((place, index) => (
                <PendingCard
                  key={`pending-${place.x}-${place.y}`}
                  letter={String.fromCharCode(97 + options.length + index)}
                  place={place}
                />
              ))}
            </div>

            {empty ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-32">
                <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
                  <ImagePlusIcon className="size-7 opacity-60" />
                  <div className="text-sm text-foreground">
                    Drop a sketch, photo or drawing here
                  </div>
                  <div className="max-w-80 text-xs">
                    Or describe the part below. Studio builds four design options to compare side by
                    side; double-click one to open it as CAD.
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <ZoomBar
            zoom={view.zoom}
            onZoom={(factor) => {
              const surface = surfaceRef.current;
              if (surface === null) return;
              const zoom = clamp(view.zoom * factor, ZOOM.min, ZOOM.max);
              const cx = surface.clientWidth / 2;
              const cy = surface.clientHeight / 2;
              saveView({
                zoom,
                x: cx - ((cx - view.x) / view.zoom) * zoom,
                y: cy - ((cy - view.y) / view.zoom) * zoom,
              });
            }}
            onFit={fit}
          />
          {started ? (
            <StatusBar
              working={working}
              built={options.length}
              pending={pending}
              onOpenChat={openChat}
            />
          ) : (
            <PromptBar
              description={board.description}
              onDescription={(description) => update(board.id, () => ({ description }))}
              pictures={board.pictures.length}
              sending={sending}
              onAddFiles={(files) => void addFiles(files, null)}
              onMake={() => void make()}
            />
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

/** Where the cards still being built go: after the set's last listed card, in its row. */
function pendingSlots(input: {
  readonly options: ReadonlyArray<DesignOption>;
  readonly from: string | null;
  readonly count: number;
  readonly placeOf: (key: string) => Place;
}): Place[] {
  const { options, from, count, placeOf } = input;
  if (count === 0) return [];
  const set = options.filter((option) => option.from === from);
  const step = CARD.width + CARD.gap;
  let start: Place;
  if (set.length > 0) {
    const last = placeOf(set.at(-1)!.key);
    start = { x: last.x + step, y: last.y };
  } else if (from === null) {
    start = OPTIONS_ORIGIN;
  } else {
    const parent = placeOf(from);
    const below = options.reduce(
      (lowest, option) => Math.max(lowest, placeOf(option.key).y),
      parent.y,
    );
    start = { x: parent.x, y: below + CARD.height + CARD.gap * 3 };
  }
  return Array.from({ length: count }, (_, index) => ({ x: start.x + index * step, y: start.y }));
}

const pictureHeight = (_picture: CanvasPicture) => 200;

function PictureCard(props: {
  readonly picture: CanvasPicture;
  readonly place: Place;
  readonly zoom: number;
  readonly onMove: (place: Place) => void;
}) {
  const moving = useRef<{ x: number; y: number; place: Place } | null>(null);
  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      style={{ left: props.place.x, top: props.place.y, width: INPUT.width }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        moving.current = { x: event.clientX, y: event.clientY, place: props.place };
      }}
      onPointerMove={(event) => {
        const start = moving.current;
        if (start === null) return;
        props.onMove({
          x: start.place.x + (event.clientX - start.x) / props.zoom,
          y: start.place.y + (event.clientY - start.y) / props.zoom,
        });
      }}
      onPointerUp={() => (moving.current = null)}
    >
      <img
        src={props.picture.preview}
        alt={props.picture.name}
        draggable={false}
        className="h-[168px] w-full bg-white object-contain"
      />
      <div className="truncate border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        {props.picture.name}
      </div>
    </div>
  );
}

function Connector(props: {
  readonly from: Place;
  readonly to: Place;
  readonly vertical?: boolean;
}) {
  const { from, to } = props;
  const bend = props.vertical
    ? Math.max(40, (to.y - from.y) / 2)
    : Math.max(60, (to.x - from.x) / 2);
  const d = props.vertical
    ? `M ${from.x} ${from.y} C ${from.x} ${from.y + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`
    : `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
  return <path d={d} fill="none" stroke="var(--border)" strokeWidth={1.5} />;
}

/** The board's name and the other boards, then its chat, in the top bar. */
function BoardBar(props: {
  readonly board: CanvasBoard;
  readonly onOpenChat: (() => void) | null;
}) {
  const boards = useCanvasStore((state) => state.boards);
  const open = useCanvasStore((state) => state.open);
  const startBoard = useCanvasStore((state) => state.startBoard);
  return (
    <div className="mr-auto flex min-w-0 items-center gap-1">
      <Menu>
        <MenuTrigger render={<Button variant="ghost" size="sm" />}>
          <span className="max-w-64 truncate font-medium">{props.board.name}</span>
          <ChevronDownIcon />
        </MenuTrigger>
        <MenuPopup align="start" side="bottom" sideOffset={6} className="max-h-80">
          {boards.map((candidate) => (
            <MenuItem key={candidate.id} onClick={() => open(candidate.id)}>
              <span className="min-w-0 truncate">{candidate.name}</span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={() => startBoard(props.board.environmentId)}>
            <PlusIcon />
            New canvas
          </MenuItem>
        </MenuPopup>
      </Menu>
      {props.onOpenChat === null ? null : (
        <Button variant="ghost-muted" size="sm" onClick={props.onOpenChat}>
          <MessageSquareIcon />
          Chat
        </Button>
      )}
    </div>
  );
}

function ZoomBar(props: {
  readonly zoom: number;
  readonly onZoom: (factor: number) => void;
  readonly onFit: () => void;
}) {
  return (
    <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-xl border border-border bg-popover/95 p-1 shadow-sm">
      <Button
        variant="ghost-muted"
        size="icon-sm"
        aria-label="Zoom out"
        onClick={() => props.onZoom(1 / 1.25)}
      >
        <MinusIcon />
      </Button>
      <span className="w-11 text-center text-xs text-muted-foreground tabular-nums">
        {Math.round(props.zoom * 100)}%
      </span>
      <Button
        variant="ghost-muted"
        size="icon-sm"
        aria-label="Zoom in"
        onClick={() => props.onZoom(1.25)}
      >
        <PlusIcon />
      </Button>
      <Button variant="ghost-muted" size="icon-sm" aria-label="Fit the board" onClick={props.onFit}>
        <MaximizeIcon />
      </Button>
    </div>
  );
}

function PromptBar(props: {
  readonly description: string;
  readonly onDescription: (description: string) => void;
  readonly pictures: number;
  readonly sending: boolean;
  readonly onAddFiles: (files: ReadonlyArray<File>) => void;
  readonly onMake: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = props.description.trim() !== "" || props.pictures > 0;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-2xl items-end gap-2 rounded-2xl border border-border bg-popover/95 p-2 shadow-lg">
        <Button
          variant="ghost-muted"
          size="icon-sm"
          aria-label="Add a picture"
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlusIcon />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            props.onAddFiles([...(event.currentTarget.files ?? [])]);
            event.currentTarget.value = "";
          }}
        />
        <Textarea
          unstyled
          rows={1}
          className="min-h-8 flex-1"
          placeholder="Describe the part: what it holds, where it mounts, how it's made"
          value={props.description}
          onChange={(event) => props.onDescription(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && ready) {
              event.preventDefault();
              props.onMake();
            }
          }}
        />
        <Button disabled={!ready || props.sending} onClick={props.onMake}>
          <LayoutGridIcon />
          Make 4 options
        </Button>
      </div>
    </div>
  );
}

function StatusBar(props: {
  readonly working: boolean;
  readonly built: number;
  readonly pending: number;
  readonly onOpenChat: () => void;
}) {
  const said = props.working
    ? props.pending > 0
      ? `Building design options · ${props.built} ready`
      : "The agent is checking the options"
    : props.built === 0
      ? "No design options came back. The chat says why."
      : `${props.built} design options · drag to turn them together · double-click one to open it as CAD`;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-popover/95 py-1.5 pr-1.5 pl-4 text-xs text-muted-foreground shadow-sm">
        <span>{said}</span>
        <Button variant="ghost" size="xs" onClick={props.onOpenChat}>
          <MessageSquareIcon />
          Open chat
        </Button>
      </div>
    </div>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
