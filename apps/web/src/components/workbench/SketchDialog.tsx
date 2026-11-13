import {
  CircleIcon,
  MinusIcon,
  MousePointer2Icon,
  MoveRightIcon,
  MoveHorizontalIcon,
  SquareIcon,
  TypeIcon,
} from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { toastManager } from "../ui/toast";
import {
  describeSketch,
  moveSketchShape,
  SKETCH_GRID,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  type SketchPoint,
  type SketchShape,
  type SketchTool,
  sketchDocument,
  sketchShapeFromDrag,
  sketchShapesMarkup,
  snapToSketchGrid,
} from "./sketchPad";

type Tool = SketchTool | "select";

const TOOLS = [
  { tool: "select", label: "Select", Icon: MousePointer2Icon },
  { tool: "line", label: "Line", Icon: MinusIcon },
  { tool: "rectangle", label: "Rectangle", Icon: SquareIcon },
  { tool: "circle", label: "Circle", Icon: CircleIcon },
  { tool: "arrow", label: "Arrow", Icon: MoveRightIcon },
  { tool: "dimension", label: "Dimension", Icon: MoveHorizontalIcon },
  { tool: "text", label: "Text", Icon: TypeIcon },
] as const;

/** A number or note being typed: a new one, or `index` of the shape being changed. */
interface Typing {
  readonly at: SketchPoint;
  readonly value: string;
  readonly index: number | null;
  readonly make: (value: string) => SketchShape;
}

interface Drag {
  readonly start: SketchPoint;
  readonly now: SketchPoint;
}

/** Twice the sheet's size, so small numbers stay sharp for the agent. */
async function sketchPicture(shapes: ReadonlyArray<SketchShape>) {
  const url = URL.createObjectURL(new Blob([sketchDocument(shapes)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = SKETCH_WIDTH * 2;
    canvas.height = SKETCH_HEIGHT * 2;
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The sketch could not be turned into a picture.");
    return new File([blob], "sketch.png", { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Draw basic shapes with typed numbers and attach them to the message. The drawing stays here after
 * attaching, so it can be changed and attached again.
 */
export function SketchDialog({
  open,
  onOpenChange,
  onAttach,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAttach: (files: File[]) => void;
}) {
  const [shapes, setShapes] = useState<ReadonlyArray<SketchShape>>([]);
  const [undo, setUndo] = useState<ReadonlyArray<ReadonlyArray<SketchShape>>>([]);
  const [tool, setTool] = useState<Tool>("rectangle");
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [typing, setTyping] = useState<Typing | null>(null);
  const [busy, setBusy] = useState(false);
  const sheet = useRef<SVGSVGElement>(null);

  function change(next: ReadonlyArray<SketchShape>) {
    setUndo((steps) => [...steps, shapes]);
    setShapes(next);
    setSelected(null);
  }

  function pointIn(event: PointerEvent) {
    const box = sheet.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - box.left) / box.width) * SKETCH_WIDTH,
      y: ((event.clientY - box.top) / box.height) * SKETCH_HEIGHT,
    };
  }

  function typingOf(index: number, shape: SketchShape): Typing | null {
    if (shape.kind === "dimension") {
      const at = { x: (shape.from.x + shape.to.x) / 2, y: (shape.from.y + shape.to.y) / 2 };
      return { at, value: shape.value, index, make: (value) => ({ ...shape, value }) };
    }
    if (shape.kind === "text") {
      return { at: shape.at, value: shape.value, index, make: (value) => ({ ...shape, value }) };
    }
    return null;
  }

  function finishTyping() {
    if (!typing) return;
    const value = typing.value.trim();
    setTyping(null);
    if (typing.index === null) {
      if (value) change([...shapes, typing.make(value)]);
    } else if (!value) {
      change(shapes.filter((_, index) => index !== typing.index));
    } else if (value !== shapeValue(shapes[typing.index])) {
      change(shapes.map((shape, index) => (index === typing.index ? typing.make(value) : shape)));
    }
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (typing) {
      finishTyping();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = snapToSketchGrid(pointIn(event));
    if (tool === "select") {
      const pressed = (event.target as Element).closest("[data-shape]");
      setSelected(pressed ? Number(pressed.getAttribute("data-shape")) : null);
      if (!pressed) return;
    }
    setDrag({ start, now: start });
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (drag) setDrag({ ...drag, now: snapToSketchGrid(pointIn(event)) });
  }

  function onPointerUp() {
    if (!drag) return;
    setDrag(null);
    const { start, now } = drag;
    if (tool === "select") {
      const dx = now.x - start.x;
      const dy = now.y - start.y;
      if (selected !== null && (dx !== 0 || dy !== 0)) {
        const moved = shapes.map((shape, index) =>
          index === selected ? moveSketchShape(shape, dx, dy) : shape,
        );
        const keep = selected;
        change(moved);
        setSelected(keep);
      }
    } else if (tool === "text") {
      // Opens on release: on press the sheet takes focus right after, which would close the box.
      setTyping({
        at: now,
        value: "",
        index: null,
        make: (value) => ({ kind: "text", at: now, value }),
      });
    } else if (tool === "dimension") {
      if (start.x === now.x && start.y === now.y) return;
      setTyping({
        at: { x: (start.x + now.x) / 2, y: (start.y + now.y) / 2 },
        value: "",
        index: null,
        make: (value) => ({ kind: "dimension", from: start, to: now, value }),
      });
    } else {
      const shape = sketchShapeFromDrag(tool, start, now);
      if (shape) change([...shapes, shape]);
    }
  }

  function onDoubleClick(event: { readonly target: EventTarget }) {
    if (tool !== "select") return;
    const pressed = (event.target as Element).closest("[data-shape]");
    const index = pressed ? Number(pressed.getAttribute("data-shape")) : -1;
    const shape = shapes[index];
    const next = shape ? typingOf(index, shape) : null;
    if (next) setTyping(next);
  }

  function undoLast() {
    setShapes(undo.at(-1) ?? []);
    setUndo(undo.slice(0, -1));
    setSelected(null);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (typing) return;
    if ((event.key === "Delete" || event.key === "Backspace") && selected !== null) {
      event.preventDefault();
      change(shapes.filter((_, index) => index !== selected));
    } else if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (undo.length > 0) undoLast();
    }
  }

  async function attach() {
    setBusy(true);
    try {
      const words = new File([describeSketch(shapes)], "sketch.txt", { type: "text/plain" });
      onAttach([await sketchPicture(shapes), words]);
      onOpenChange(false);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Couldn't attach the sketch",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  // Shows the shape under the pointer before it is dropped, without touching the undo steps.
  const shown = (() => {
    if (!drag) return shapes;
    if (tool === "select") {
      return shapes.map((shape, index) =>
        index === selected
          ? moveSketchShape(shape, drag.now.x - drag.start.x, drag.now.y - drag.start.y)
          : shape,
      );
    }
    if (tool === "text") return shapes;
    if (tool === "dimension") {
      return drag.start.x === drag.now.x && drag.start.y === drag.now.y
        ? shapes
        : [...shapes, { kind: "dimension" as const, from: drag.start, to: drag.now, value: "" }];
    }
    const shape = sketchShapeFromDrag(tool, drag.start, drag.now);
    return shape ? [...shapes, shape] : shapes;
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyping(null);
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Draw a sketch</DialogTitle>
          <DialogDescription>
            Rough shapes are fine: only the numbers you type are sizes.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ToggleGroup
                aria-label="Sketch tools"
                value={[tool]}
                onValueChange={(value) => {
                  const next = value[0] as Tool | undefined;
                  if (next) setTool(next);
                  setSelected(null);
                }}
              >
                {TOOLS.map(({ tool: name, label, Icon }) => (
                  <Toggle key={name} value={name}>
                    <Icon aria-hidden="true" />
                    {label}
                  </Toggle>
                ))}
              </ToggleGroup>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={undo.length === 0} onClick={undoLast}>
                  Undo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={shapes.length === 0}
                  onClick={() => change([])}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-sm border bg-background text-foreground">
              <svg
                ref={sheet}
                viewBox={`0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}`}
                role="img"
                aria-label="Sketch sheet"
                tabIndex={0}
                className="block aspect-8/5 w-full touch-none select-none outline-none [&_[data-selected=true]]:text-primary"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onDoubleClick={onDoubleClick}
              >
                <defs>
                  <pattern
                    id="sketch-grid"
                    width={SKETCH_GRID}
                    height={SKETCH_GRID}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d={`M ${SKETCH_GRID} 0 L 0 0 0 ${SKETCH_GRID}`}
                      fill="none"
                      stroke="var(--border)"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#sketch-grid)" />
                <g
                  dangerouslySetInnerHTML={{
                    __html: sketchShapesMarkup(shown, {
                      paper: "var(--background)",
                      selected,
                    }),
                  }}
                />
              </svg>
              {typing ? (
                <div
                  className="absolute w-36 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${(typing.at.x / SKETCH_WIDTH) * 100}%`,
                    top: `${(typing.at.y / SKETCH_HEIGHT) * 100}%`,
                  }}
                >
                  <Input
                    autoFocus
                    size="sm"
                    aria-label={typing.value ? "Change the number" : "Type a number or note"}
                    placeholder="80 mm"
                    value={typing.value}
                    onChange={(event) => setTyping({ ...typing, value: event.target.value })}
                    onBlur={finishTyping}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") finishTyping();
                      if (event.key === "Escape") setTyping(null);
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button disabled={busy || shapes.length === 0} onClick={() => void attach()}>
            {busy ? "Attaching" : "Attach"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function shapeValue(shape: SketchShape | undefined) {
  return shape && "value" in shape ? shape.value : "";
}
