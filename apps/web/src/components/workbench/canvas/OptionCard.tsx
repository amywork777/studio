import type { EnvironmentId } from "@t3tools/contracts";
import { CopyPlusIcon } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import { CARD, type DesignOption, type Place } from "./canvasOptions";
import { type MeshSize, MeshView, turned, type ViewAngle } from "./meshView";
import { useMeshBytes } from "./useCanvasOptions";

const VIEW_HEIGHT = 228;

/** A length in millimetres as a card says it: whole millimetres, a tenth under ten. */
const mm = (value: number) => (value < 10 ? value.toFixed(1) : String(Math.round(value)));

/** A mass in grams, in grams under a kilogram and in kilograms over. */
function massLabel(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`;
  return `${grams < 10 ? grams.toFixed(1) : Math.round(grams)} g`;
}

/** A card still being built: its letter, and that the agent is on it. */
export function PendingCard(props: { readonly letter: string; readonly place: Place }) {
  return (
    <div
      className="absolute flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 text-muted-foreground"
      style={{ left: props.place.x, top: props.place.y, width: CARD.width, height: CARD.height }}
    >
      <Spinner className="size-4" />
      <span className="text-sm">Building option {props.letter.toUpperCase()}</span>
    </div>
  );
}

/**
 * One design option on the board: its mesh, turned with the others (`angle`) and drawn at one
 * scale with them (`radius`), so sizes compare at a glance; its size, measured from the mesh, and
 * its mass, as the CAD tools measured it. A double-click opens it as CAD.
 */
export function OptionCard(props: {
  readonly environmentId: EnvironmentId;
  readonly option: DesignOption;
  /** Its mesh on this computer. */
  readonly meshPath: string;
  readonly stamp: string;
  readonly place: Place;
  readonly zoom: number;
  readonly angle: ViewAngle;
  readonly onAngle: (angle: ViewAngle) => void;
  /** The radius every card frames, in millimetres; null frames this card's own part. */
  readonly radius: number | null;
  readonly onSize: (key: string, size: MeshSize) => void;
  readonly lightest: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
  readonly onMore: (() => void) | null;
  readonly onMove: (place: Place) => void;
}) {
  const { option, onSize } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<MeshView | null>(null);
  const [size, setSize] = useState<MeshSize | null>(null);
  const [failed, setFailed] = useState(false);
  const bytes = useMeshBytes({
    environmentId: props.environmentId,
    path: props.meshPath,
    stamp: props.stamp,
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the WebGL view for the card's canvas element and loads the mesh into it
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || bytes === null) return;
    const view = viewRef.current ?? new MeshView(canvas);
    viewRef.current = view;
    let cancelled = false;
    view
      .load(bytes, document.documentElement.classList.contains("dark"))
      .then((measured) => {
        if (cancelled) return;
        setFailed(false);
        setSize(measured);
        onSize(option.key, measured);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [bytes, option.key, onSize]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- disposes the WebGL view when the card leaves the board
  useEffect(
    () => () => {
      viewRef.current?.dispose();
      viewRef.current = null;
    },
    [],
  );

  const radius = props.radius ?? size?.radius ?? null;
  const zoom = props.zoom;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- draws the WebGL view when the shared angle, scale or zoom changes; it never draws in a loop
  useEffect(() => {
    if (size === null || radius === null) return;
    const width = CARD.width - 2;
    viewRef.current?.draw(
      props.angle,
      radius,
      width * Math.min(zoom, 2),
      VIEW_HEIGHT * Math.min(zoom, 2),
    );
  }, [props.angle, radius, size, zoom]);

  const turning = useRef<{ x: number; y: number; angle: ViewAngle } | null>(null);
  const onViewDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    props.onSelect();
    event.currentTarget.setPointerCapture(event.pointerId);
    turning.current = { x: event.clientX, y: event.clientY, angle: props.angle };
  };
  const onViewMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = turning.current;
    if (start === null) return;
    props.onAngle(turned(start.angle, event.clientX - start.x, event.clientY - start.y));
  };
  const onViewUp = () => {
    turning.current = null;
  };

  const moving = useRef<{ x: number; y: number; place: Place } | null>(null);
  const onCardDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button") !== null) return;
    event.stopPropagation();
    props.onSelect();
    event.currentTarget.setPointerCapture(event.pointerId);
    moving.current = { x: event.clientX, y: event.clientY, place: props.place };
  };
  const onCardMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = moving.current;
    if (start === null) return;
    props.onMove({
      x: start.place.x + (event.clientX - start.x) / zoom,
      y: start.place.y + (event.clientY - start.y) / zoom,
    });
  };

  const letter = option.key.toUpperCase();
  return (
    <div
      className={cn(
        "group absolute flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow",
        props.selected ? "border-foreground/40 shadow-lg" : "border-border hover:shadow-md",
      )}
      style={{ left: props.place.x, top: props.place.y, width: CARD.width, height: CARD.height }}
      onPointerDown={onCardDown}
      onPointerMove={onCardMove}
      onPointerUp={() => (moving.current = null)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        props.onOpen();
      }}
    >
      <div className="relative bg-muted/40" style={{ height: VIEW_HEIGHT }}>
        <canvas
          ref={canvasRef}
          className="size-full cursor-grab active:cursor-grabbing"
          onPointerDown={onViewDown}
          onPointerMove={onViewMove}
          onPointerUp={onViewUp}
          onPointerCancel={onViewUp}
        />
        {bytes === null || (size === null && !failed) ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Spinner className="size-4" />
          </div>
        ) : null}
        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted-foreground">
            Its mesh could not be read.
          </div>
        ) : null}
        <span className="absolute top-2.5 left-3 rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-medium text-foreground">
          {letter}
        </span>
        {props.lightest ? (
          <span className="absolute top-2.5 right-3 rounded-md bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground">
            Lightest
          </span>
        ) : null}
        {props.onMore === null ? null : (
          <div className="pointer-events-none absolute right-2.5 bottom-2.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
            <Button size="xs" variant="outline" onClick={props.onMore}>
              <CopyPlusIcon />
              More like this
            </Button>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 cursor-default flex-col gap-1.5 px-3.5 pt-3 pb-3">
        <div className="truncate text-sm font-medium text-foreground">{option.name}</div>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{option.idea}</p>
        <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Size</dt>
          <dd className="truncate text-foreground tabular-nums">
            {size === null
              ? "Not measured yet"
              : `${mm(size.x)} × ${mm(size.y)} × ${mm(size.z)} mm`}
          </dd>
          <dt className="text-muted-foreground">Mass</dt>
          <dd className="truncate text-foreground tabular-nums">
            {option.massGrams === null ? "Not checked" : massLabel(option.massGrams)}
            {option.material === null ? null : (
              <span className="text-muted-foreground"> · {option.material}</span>
            )}
          </dd>
        </dl>
      </div>
    </div>
  );
}
