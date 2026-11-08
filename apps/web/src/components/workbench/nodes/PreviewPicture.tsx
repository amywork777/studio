import { useLayoutEffect, useRef } from "react";

import type { Change, Drawn } from "./sizePreview";

/** The view: from the front right and above, Z up, as a CAD tool's isometric. */
const TOWARD = norm([1, -1, 1]);
const RIGHT = norm([1, 1, 0]);
const UP = norm([-1, 1, 2]);
const LIGHT = norm([0.4, -0.6, 1]);

type Vec = readonly [number, number, number];
function norm(v: Vec): Vec {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Flat {
  readonly points: ReadonlyArray<readonly [number, number]>;
  readonly depth: number;
  readonly shade: number;
}

/** A solid's triangles seen from the view: their corners on the picture, how far, how lit. */
function flatten(drawn: Drawn): ReadonlyArray<Flat> {
  const { positions, triangles } = drawn;
  const corner = (index: number): Vec => [
    positions[index * 3] ?? 0,
    positions[index * 3 + 1] ?? 0,
    positions[index * 3 + 2] ?? 0,
  ];
  const out: Flat[] = [];
  for (let at = 0; at + 2 < triangles.length; at += 3) {
    const a = corner(triangles[at] ?? 0);
    const b = corner(triangles[at + 1] ?? 0);
    const c = corner(triangles[at + 2] ?? 0);
    const u: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = norm([
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]);
    out.push({
      points: [a, b, c].map((p) => [dot(p, RIGHT), -dot(p, UP)] as const),
      depth: (dot(a, TOWARD) + dot(b, TOWARD) + dot(c, TOWARD)) / 3,
      shade: Math.abs(dot(normal, LIGHT)),
    });
  }
  return out;
}

/** A theme colour as the canvas takes it. */
const token = (element: Element, name: string) =>
  getComputedStyle(element).getPropertyValue(name).trim() || "gray";

/**
 * The part with what a size changes lit on it, drawn from the preview's own triangles: the part in
 * the view's greys, and over it, seen through it, what the size adds (filled in the brand colour)
 * and takes away (outlined in it). A size pointed at, not typed, is drawn all lit: what it shapes.
 */
export function PreviewPicture(props: {
  readonly body: Drawn | null;
  readonly change: Change | null;
  readonly typed: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { body, change, typed } = props;
  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (element === null || element === undefined || context === null || context === undefined) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const width = element.clientWidth;
    const height = element.clientHeight;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const part = body === null ? [] : flatten(body);
    const added = change?.added ? flatten(change.added) : [];
    const removed = change?.removed ? flatten(change.removed) : [];
    const all = [...part, ...added, ...removed];
    if (all.length === 0) return;
    const xs = all.flatMap((flat) => flat.points.map((point) => point[0]));
    const ys = all.flatMap((flat) => flat.points.map((point) => point[1]));
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const scale = Math.min(
      (width - 16) / (Math.max(...xs) - left || 1),
      (height - 16) / (Math.max(...ys) - top || 1),
    );
    const offsetX = (width - (Math.max(...xs) - left) * scale) / 2;
    const offsetY = (height - (Math.max(...ys) - top) * scale) / 2;
    const path = (flat: Flat) => {
      context.beginPath();
      flat.points.forEach(([x, y], index) => {
        const px = offsetX + (x - left) * scale;
        const py = offsetY + (y - top) * scale;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.closePath();
    };

    const ground = token(element, "--card");
    const ink = token(element, "--muted-foreground");
    const primary = token(element, "--primary");
    // The part, far triangles first, each lit by how it faces the light.
    for (const flat of part.toSorted((a, b) => a.depth - b.depth)) {
      path(flat);
      context.globalAlpha = 1;
      context.fillStyle = ground;
      context.fill();
      context.globalAlpha = 0.18 + 0.32 * (1 - flat.shade);
      context.fillStyle = ink;
      context.fill();
    }
    // What changes, over the part, so a hole inside it still shows.
    context.lineJoin = "round";
    for (const flat of removed.toSorted((a, b) => a.depth - b.depth)) {
      path(flat);
      context.globalAlpha = typed ? 0.18 : 0.75 + 0.25 * flat.shade;
      context.fillStyle = primary;
      context.fill();
      if (typed) {
        context.globalAlpha = 0.9;
        context.strokeStyle = primary;
        context.lineWidth = 0.6;
        context.stroke();
      }
    }
    for (const flat of added.toSorted((a, b) => a.depth - b.depth)) {
      path(flat);
      context.globalAlpha = 0.75 + 0.25 * flat.shade;
      context.fillStyle = primary;
      context.fill();
    }
    context.globalAlpha = 1;
  }, [body, change, typed]);
  return <canvas ref={canvas} aria-hidden className="size-full" />;
}
